local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'released' }
end
local record = cjson.decode(payload)
if record.state == 'pending' and record.claimId == ARGV[1] then
  redis.call('DEL', KEYS[1])
  redis.call('SREM', KEYS[2], KEYS[1])
end
return { 'released' }
