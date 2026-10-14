#!/bin/bash
# Run rerender.py in the pinned RoboLab/Isaac environment. usage: rr.sh [rerender.py args...]
export LD_LIBRARY_PATH=/data/users/ali/vla_wam/envs/robolab-native-libs-ubuntu2204/usr/lib/x86_64-linux-gnu:/data/users/ali/glvnd/lib:/data/users/ali/vla_wam/envs/fastwam-native-libs/lib:/usr/lib/x86_64-linux-gnu
export OMNI_KIT_ACCEPT_EULA=YES ACCEPT_EULA=Y PRIVACY_CONSENT=Y
CACHE=/tmp/sgdw-rr-cache
mkdir -p $CACHE
export XDG_CACHE_HOME=$CACHE WARP_CACHE_PATH=$CACHE/warp MPLCONFIGDIR=$CACHE/mpl
export PYTHONPATH=/data/users/ali/rws-20260926/code:/data/users/ali/rws-20260926/external/RoboLab-0aef241
export PYTHONUNBUFFERED=1 PYTHONNOUSERSITE=1
cd /data/users/ali/rws-20260926/code
exec /data/users/ali/vla_wam/envs/robolab-v2-isaac50/bin/python /data/users/ali/sgdw-web/work/rerender/rerender.py "$@"
