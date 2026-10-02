#!/bin/sh
# Usage: tools/blender/build.sh props [crate car ...]   |   tools/blender/build.sh weapons ...
cd "$(dirname "$0")"; kind="$1"; shift
exec blender --background --python "$kind.py" -- "$@"
