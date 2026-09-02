local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'dependency_unavailable' }
end
local analysis = cjson.decode(payload)
if analysis.status == 'cancelling' then
  return { 'cancelled', payload }
end
if analysis.status == 'cancelled' then
  return { 'cancelled', payload }
end
if analysis.status ~= 'running' or type(analysis.execution) ~= 'table' or analysis.execution.jobId ~= ARGV[1] or analysis.execution.attempt ~= tonumber(ARGV[2]) then
  return { 'stale_attempt' }
end
analysis.status = ARGV[4]
analysis.updatedAt = ARGV[3]
analysis.failure = cjson.decode(ARGV[5])
analysis.progress = cjson.decode(ARGV[6])
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
return { ARGV[4], cjson.encode(analysis) }
