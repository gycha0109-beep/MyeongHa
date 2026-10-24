# C08 synthetic N06 - owner-preapproved one paid model POST at most
# V1 run 40014505187 / V2 run 40079361920: zero inference POSTs
# Root cause found: official model endpoint pricing has prompt/completion, no request key
model=openai/gpt-oss-120b
maximum_paid_POST=1
maximum_reserved_microUSD=4000
maximum_completion_tokens=256
max_request_bytes=4096
ZDR_enforced_on_request=true
data_collection=deny
strict_json_schema=true
fallback=false
retries=0
production_changes=none
