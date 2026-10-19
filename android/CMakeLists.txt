cmake_minimum_required(VERSION 3.4.1)

add_library(rjsniffer-lib SHARED src/main/c/rjsniffer-lib.c)

find_library(log-lib log)

target_link_libraries(rjsniffer-lib ${log-lib})
