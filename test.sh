!#/bin/bash

curl -X POST http://localhost:11434/api/generate -H "Content-Type: application/json" -d '{"model":"mistral","prompt":"Write a poem about a lonely computer."}'
