local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'dependency_unavailable' }
end

local analysis = cjson.decode(payload)
if type(analysis.execution) ~= 'table' or analysis.execution.jobId ~= ARGV[1] then
  return { 'stale_attempt' }
end
if analysis.status == 'cancelling' or analysis.status == 'cancelled' then
  return { 'cancelled' }
end
if analysis.status ~= 'running' then
  return { 'terminal' }
end
if analysis.execution.attempt ~= tonumber(ARGV[2]) then
  return { 'stale_attempt' }
end

analysis.rValidation = cjson.decode(ARGV[3])
analysis.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
return { 'updated' }
