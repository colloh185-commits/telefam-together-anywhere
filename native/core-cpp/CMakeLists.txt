cmake_minimum_required(VERSION 3.22)
project(telefamcore CXX)
set(CMAKE_CXX_STANDARD 17)

add_library(telefamcore SHARED src/engine.cpp $<$<BOOL:${ANDROID}>:src/vault.cpp>)
target_include_directories(telefamcore PUBLIC include)

# Hardening + make reverse engineering expensive: hidden symbols, no RTTI/exceptions info leaks,
# stripped binaries, LTO, control-flow integrity where available.
target_compile_options(telefamcore PRIVATE
  -O2 -fvisibility=hidden -fvisibility-inlines-hidden -ffunction-sections -fdata-sections
  -fstack-protector-strong -D_FORTIFY_SOURCE=2 -fno-rtti -flto)
target_link_options(telefamcore PRIVATE -Wl,--gc-sections -Wl,--exclude-libs,ALL -s -flto)
