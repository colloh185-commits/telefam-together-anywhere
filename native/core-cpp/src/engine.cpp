// Telefam core engine: offline outbox, backoff scheduler, shared rules.
#include "telefam_core.h"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <mutex>
#include <random>
#include <sstream>
#include <string>
#include <vector>

namespace {

struct Item {
  int64_t id;
  std::string kind;
  std::string payload;
  int attempts = 0;
  int64_t next_at_ms = 0;
};

std::mutex g_mu;
std::vector<Item> g_items;
std::string g_path;
int64_t g_seq = 1;
constexpr size_t kMaxItems = 5000;

int64_t now_ms() {
  using namespace std::chrono;
  return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
}

std::string escape(const std::string& s) {
  std::string o;
  for (char c : s) { if (c == '\n') o += "\\n"; else if (c == '\t') o += "\\t"; else if (c == '\\') o += "\\\\"; else o += c; }
  return o;
}
std::string unescape(const std::string& s) {
  std::string o;
  for (size_t i = 0; i < s.size(); ++i) {
    if (s[i] == '\\' && i + 1 < s.size()) { char n = s[++i]; o += n == 'n' ? '\n' : n == 't' ? '\t' : n; }
    else o += s[i];
  }
  return o;
}

// Atomic write: tmp file + rename so a crash never corrupts the queue.
void persist() {
  if (g_path.empty()) return;
  std::string tmp = g_path + ".tmp";
  {
    std::ofstream f(tmp, std::ios::trunc);
    f << g_seq << "\n";
    for (auto& it : g_items) f << it.id << '\t' << it.attempts << '\t' << it.next_at_ms << '\t' << escape(it.kind) << '\t' << escape(it.payload) << '\n';
  }
  std::rename(tmp.c_str(), g_path.c_str());
}

int64_t backoff_ms(int attempts) {
  static thread_local std::mt19937_64 rng{std::random_device{}()};
  int64_t cap = 5 * 60 * 1000;
  int64_t base = std::min<int64_t>(cap, 1000LL << std::min(attempts, 18));
  std::uniform_int_distribution<int64_t> d(base / 2, base);
  return d(rng);
}

}  // namespace

extern "C" {

int tf_outbox_open(const char* path) {
  std::lock_guard<std::mutex> l(g_mu);
  g_path = path ? path : "";
  g_items.clear();
  std::ifstream f(g_path);
  if (!f) return 0;
  std::string line;
  if (std::getline(f, line)) g_seq = std::max<int64_t>(1, std::stoll(line));
  while (std::getline(f, line)) {
    std::stringstream ss(line);
    std::string id, at, next, kind, payload;
    if (!std::getline(ss, id, '\t') || !std::getline(ss, at, '\t') || !std::getline(ss, next, '\t') ||
        !std::getline(ss, kind, '\t') || !std::getline(ss, payload)) continue;
    g_items.push_back({std::stoll(id), unescape(kind), unescape(payload), std::stoi(at), std::stoll(next)});
  }
  return (int)g_items.size();
}

int64_t tf_outbox_enqueue(const char* kind, const char* payload) {
  std::lock_guard<std::mutex> l(g_mu);
  if (g_items.size() >= kMaxItems) g_items.erase(g_items.begin());  // drop oldest analytics first
  Item it{g_seq++, kind ? kind : "", payload ? payload : "", 0, 0};
  if (it.payload.size() > 16 * 1024) return -1;
  g_items.push_back(it);
  persist();
  return it.id;
}

int tf_outbox_next(int max, char* buf, int buf_len) {
  std::lock_guard<std::mutex> l(g_mu);
  int64_t t = now_ms();
  std::string out;
  int n = 0;
  for (auto& it : g_items) {
    if (n >= max) break;
    if (it.next_at_ms > t) continue;
    std::string line = std::to_string(it.id) + '\t' + it.payload + '\n';
    if ((int)(out.size() + line.size()) >= buf_len) break;
    out += line;
    ++n;
  }
  std::memcpy(buf, out.data(), out.size());
  buf[out.size()] = '\0';
  return (int)out.size();
}

void tf_outbox_ack(const int64_t* ids, int n) {
  std::lock_guard<std::mutex> l(g_mu);
  std::vector<int64_t> v(ids, ids + n);
  g_items.erase(std::remove_if(g_items.begin(), g_items.end(), [&](const Item& it) {
    return std::find(v.begin(), v.end(), it.id) != v.end();
  }), g_items.end());
  persist();
}

int64_t tf_outbox_fail(const int64_t* ids, int n) {
  std::lock_guard<std::mutex> l(g_mu);
  int64_t wait = 1000;
  for (auto& it : g_items)
    for (int i = 0; i < n; ++i)
      if (it.id == ids[i]) { it.attempts++; wait = backoff_ms(it.attempts); it.next_at_ms = now_ms() + wait; }
  persist();
  return wait;
}

int tf_otp_cooldown_for_hit(int hit) {
  if (hit <= 3) return 60;
  if (hit == 4) return 15 * 60;
  if (hit == 5) return 60 * 60;
  return 24 * 60 * 60;
}

int tf_is_old_enough(int y, int m, int d, int ty, int tm, int td) {
  int age = ty - y;
  if (tm < m || (tm == m && td < d)) --age;
  return age >= 13 && age <= 120;
}

}  // extern "C"
