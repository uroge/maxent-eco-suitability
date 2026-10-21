local analysisPayload = redis.call('GET', KEYS[1])
if not analysisPayload then
  return { 'missing' }
end

local analysis = cjson.decode(analysisPayload)
if analysis.ownerId ~= ARGV[1] then
  return { 'missing' }
end

local existingPayload = redis.call('GET', KEYS[2])
if existingPayload then
  local existing = cjson.decode(existingPayload)
  if existing.fingerprint ~= ARGV[2] or existing.operation ~= ARGV[3] then
    return { 'conflict' }
  end
  if existing.state == 'completed' then
    return { 'replay', existing.response }
  end
  if tonumber(existing.leaseExpiresAt) > tonumber(ARGV[5]) then
    return { 'pending' }
  end
end

local ttl = redis.call('TTL', KEYS[1])
if ttl < 1 then
  return { 'missing' }
end
local record = {
  operation = ARGV[3],
  fingerprint = ARGV[2],
  state = 'pending',
  claimId = ARGV[4],
  leaseExpiresAt = ARGV[6],
  createdAt = ARGV[7]
}
redis.call('SET', KEYS[2], cjson.encode(record), 'EX', ttl)
redis.call('SADD', KEYS[3], KEYS[2])
redis.call('EXPIRE', KEYS[3], ttl)
return { 'claimed' }
