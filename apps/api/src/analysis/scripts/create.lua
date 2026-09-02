local existing = redis.call('GET', KEYS[2])
if existing then
  local idempotency = cjson.decode(existing)
  if idempotency.fingerprint == ARGV[2] then
    local analysis = redis.call('GET', KEYS[1] .. idempotency.analysisId)
    if analysis then
      return { 'replay', analysis }
    end
  end
  return { 'conflict' }
end

redis.call('SET', KEYS[1] .. ARGV[1], ARGV[3])
redis.call('SET', KEYS[2], cjson.encode({ analysisId = ARGV[1], fingerprint = ARGV[2] }))
redis.call('ZADD', KEYS[3], ARGV[5], ARGV[1])
return { 'created', ARGV[3] }
