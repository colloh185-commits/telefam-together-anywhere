// Telefam core engine — C ABI used by Android (JNI) and iOS/desktop (cinterop).
#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

// Outbox (offline-first action queue). Persisted to `path` after every mutation.
int      tf_outbox_open(const char* path);
int64_t  tf_outbox_enqueue(const char* kind, const char* payload_json);
// Writes up to `max` ready items as "id\tpayload\n" lines into buf; returns bytes written.
int      tf_outbox_next(int max, char* buf, int buf_len);
void     tf_outbox_ack(const int64_t* ids, int n);
// Marks items failed; returns ms until next attempt (exponential backoff with full jitter, cap 5 min).
int64_t  tf_outbox_fail(const int64_t* ids, int n);

// Business rules shared with web/backend.
int      tf_otp_cooldown_for_hit(int hit);
int      tf_is_old_enough(int y, int m, int d, int ty, int tm, int td);

// Crypto helpers.
const char* tf_sha256_hex(const char* s); // returns pointer to thread-local buffer

#ifdef __cplusplus
}
#endif
