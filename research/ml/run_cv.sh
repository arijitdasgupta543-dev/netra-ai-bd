#!/bin/bash
S=${S:-$(cd "$(dirname "$0")/.." && pwd)}
cd $S/ml
for job in "crop_mnv2 0" "full_mnv2 0" "crop_v1 0" "FINAL" "crop_densenet121 0" "crop_resnet50 0" "crop_mnv2 1" "full_mnv2 1" "crop_vgg16 0"; do
  if [ "$job" = "FINAL" ]; then TF_CPP_MIN_LOG_LEVEL=3 python3 final_clean.py $S > final_clean.log 2>&1; echo FINAL_DONE >> cv_log2.txt; continue; fi
  set -- $job
  TF_CPP_MIN_LOG_LEVEL=3 python3 train_cv.py $S $1 $2 > job_$1_$2.log 2>&1; echo "FINISHED $1 $2" >> cv_log2.txt
done
echo ALLDONE >> cv_log2.txt
