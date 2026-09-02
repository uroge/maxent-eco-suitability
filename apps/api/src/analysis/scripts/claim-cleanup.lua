local payload = redis.call('GET', KEYS[1])
if not payload then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return { 'missing' }
end

local cleanup = cjson.decode(payload)
if type(cleanup.claimExpiresAt) == 'string' and cleanup.claimExpiresAt > ARGV[2] then
  return { 'claimed' }
end

cleanup.claimId = ARGV[3]
cleanup.claimExpiresAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(cleanup))
return { 'claimed', cjson.encode(cleanup) }
