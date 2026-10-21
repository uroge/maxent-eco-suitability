local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'missing' }
end
local record = cjson.decode(payload)
if record.state ~= 'pending' or record.claimId ~= ARGV[1] then
  return { 'stale' }
end
record.state = 'completed'
record.response = ARGV[2]
record.completedAt = ARGV[3]
record.claimId = nil
record.leaseExpiresAt = nil
local ttl = redis.call('TTL', KEYS[1])
if ttl < 1 then
  return { 'missing' }
end
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ttl)
return { 'completed' }
