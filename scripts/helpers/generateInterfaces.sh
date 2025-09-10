#!/bin/bash

create_interface () {
    contract="$(basename "$file" | cut -d. -f1)"
    dir="$(dirname "$file")"
    cast interface "$file" -n $contract > scripts/helpers/interfaces/$contract.generated.sol
}

forge compile --skip test script

mkdir -p scripts/helpers/interfaces

# Only process artifact JSON files and skip build-info
find out \
  -path "out/build-info" -prune -o \
  -type f -name "*.json" -print0 | while read -d $'\0' file
do
  echo $file
  create_interface 
done 


