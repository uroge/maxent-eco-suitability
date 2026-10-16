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

local incoming = cjson.decode(ARGV[3])
if type(analysis.rValidation) == 'table' then
  local currentGeneration = analysis.rValidation.generation or 0
  local currentSequence = analysis.rValidation.lastSequence or -1
  if currentGeneration > incoming.generation then
    return { 'stale_attempt' }
  end
  if currentGeneration == incoming.generation and currentSequence >= incoming.lastSequence then
    return { 'updated' }
  end
end
analysis.rValidation = incoming
analysis.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
return { 'updated' }
