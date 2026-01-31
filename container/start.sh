#!/bin/bash
set -e

exec ttyd \
    --port 7681 \
    --interface 127.0.0.1 \
    --writable \
    --ping-interval 30 \
    /bin/zsh
