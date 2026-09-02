local analysisPayload = redis.call('GET', KEYS[1])
if not analysisPayload then
  return { 'dependency_unavailable' }
end

local analysis = cjson.decode(analysisPayload)
if analysis.status == 'cancelling' or analysis.status == 'cancelled' then
  return { 'cancelled' }
end
if analysis.status == 'succeeded' or analysis.status == 'failed' or analysis.status == 'expired' then
  return { 'terminal' }
end
if analysis.status ~= 'running' or type(analysis.execution) ~= 'table' or analysis.execution.jobId ~= ARGV[1] or analysis.execution.attempt ~= tonumber(ARGV[2]) then
  return { 'stale_attempt' }
end

local existing = redis.call('GET', KEYS[2])
if existing then
  local provisional = cjson.decode(existing)
  if provisional.jobId ~= ARGV[1] then
    return { 'stale_attempt' }
  end
  provisional.attempt = tonumber(ARGV[2])
  redis.call('SET', KEYS[2], cjson.encode(provisional), 'KEEPTTL')
  return { 'provisioned', cjson.encode(provisional) }
end

redis.call('SET', KEYS[2], ARGV[3], 'KEEPTTL')
return { 'provisioned', ARGV[3] }
