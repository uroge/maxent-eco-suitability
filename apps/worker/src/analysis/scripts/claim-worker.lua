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
if analysis.status == 'succeeded' or analysis.status == 'failed' or analysis.status == 'expired' then
  return { 'terminal' }
end
local attempt = tonumber(ARGV[2])
if analysis.status == 'running' then
  if analysis.execution.attempt == attempt then
    return { 'already_running_same_attempt', payload }
  end
  if type(analysis.execution.attempt) == 'number' and analysis.execution.attempt > attempt then
    return { 'stale_attempt' }
  end
end
if analysis.status ~= 'queued' and analysis.status ~= 'running' then
  return { 'stale_attempt' }
end
analysis.status = 'running'
analysis.updatedAt = ARGV[3]
analysis.execution.attempt = attempt
analysis.progress = { stage = 'preparing', percent = 0, attempt = attempt, updatedAt = ARGV[3] }
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
return { 'claimed', cjson.encode(analysis) }
