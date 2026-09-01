local existing = redis.call('GET', KEYS[2])
if existing then
  local idempotency = cjson.decode(existing)
  if idempotency.fingerprint == ARGV[2] then
    local dataset = redis.call('GET', KEYS[1] .. idempotency.datasetId)
    if dataset then
      return { 'replay', dataset }
    end
  end
  return { 'conflict' }
end

redis.call('SET', KEYS[1] .. ARGV[1], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[2], cjson.encode({ datasetId = ARGV[1], fingerprint = ARGV[2] }), 'EX', ARGV[4])
redis.call('ZADD', KEYS[3], ARGV[5], ARGV[1])
return { 'created', ARGV[3] }
