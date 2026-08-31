local payload = redis.call('GET', KEYS[1])
if not payload then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return { 'missing' }
end

local analysis = cjson.decode(payload)
if analysis.expiresAt > ARGV[2] then
  return { 'not_due' }
end

if analysis.status == 'expired' then
  return { 'expired' }
end

analysis.status = 'expired'
analysis.updatedAt = ARGV[2]
analysis.expiredAt = ARGV[2]
analysis.failure = cjson.null
redis.call('SET', KEYS[1], cjson.encode(analysis), 'EX', ARGV[3])
redis.call('DEL', KEYS[3])
redis.call('ZREM', KEYS[2], ARGV[1])
return { 'expired' }
