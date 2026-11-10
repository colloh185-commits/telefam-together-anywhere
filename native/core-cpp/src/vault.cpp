// Obfuscated constants + anti-tamper, exposed to Android via JNI.
// Strings are XOR-encoded at compile time so they never appear in the binary's string table.
#include <jni.h>
#include <array>
#include <string>
#include <sys/ptrace.h>
#include <unistd.h>
#include <fstream>

namespace {

constexpr char kKey = 0x5A ^ (__LINE__ & 0x7F);

template <size_t N>
struct XorStr {
  std::array<char, N> data{};
  constexpr XorStr(const char (&s)[N]) { for (size_t i = 0; i < N; ++i) data[i] = s[i] ^ (kKey + (char)i); }
  std::string str() const { std::string o(N - 1, '\0'); for (size_t i = 0; i + 1 < N; ++i) o[i] = data[i] ^ (kKey + (char)i); return o; }
};
#define TF_OBF(s) ([] { constexpr XorStr<sizeof(s)> x(s); return x; }().str())

bool traced() {
  std::ifstream f("/proc/self/status");
  std::string line;
  while (std::getline(f, line))
    if (line.rfind("TracerPid:", 0) == 0) return std::stoi(line.substr(10)) != 0;
  return false;
}

bool hooked() {
  std::ifstream maps("/proc/self/maps");
  std::string line;
  while (std::getline(maps, line))
    if (line.find(TF_OBF("frida")) != std::string::npos || line.find(TF_OBF("xposed")) != std::string::npos) return true;
  return false;
}

}  // namespace

extern "C" JNIEXPORT jstring JNICALL Java_app_telefam_data_NativeVault_host(JNIEnv* env, jobject) {
  return env->NewStringUTF(TF_OBF("api.telefam.app").c_str());
}

extern "C" JNIEXPORT jobjectArray JNICALL Java_app_telefam_data_NativeVault_pins(JNIEnv* env, jobject) {
  // Replace with the real SPKI SHA-256 pins (primary + backup) before release.
  const std::string pins[] = {TF_OBF("sha256/REPLACE_WITH_PRIMARY_PIN="), TF_OBF("sha256/REPLACE_WITH_BACKUP_PIN=")};
  jobjectArray arr = env->NewObjectArray(2, env->FindClass("java/lang/String"), nullptr);
  for (int i = 0; i < 2; ++i) env->SetObjectArrayElement(arr, i, env->NewStringUTF(pins[i].c_str()));
  return arr;
}

extern "C" JNIEXPORT jboolean JNICALL Java_app_telefam_data_NativeVault_selfCheck(JNIEnv* env, jobject, jstring apk) {
  if (traced() || hooked()) return JNI_FALSE;
  const char* p = env->GetStringUTFChars(apk, nullptr);
  bool ok = access(p, R_OK) == 0;  // signature digest compared server-side via Play Integrity
  env->ReleaseStringUTFChars(apk, p);
  return ok ? JNI_TRUE : JNI_FALSE;
}
