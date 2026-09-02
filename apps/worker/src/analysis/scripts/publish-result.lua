local analysisPayload = redis.call('GET', KEYS[1])
local provisionalPayload = redis.call('GET', KEYS[2])
if not analysisPayload or not provisionalPayload then
  return { 'dependency_unavailable' }
end

local analysis = cjson.decode(analysisPayload)
if analysis.status == 'cancelling' or analysis.status == 'cancelled' then
  return { 'cancelled' }
end
if analysis.status ~= 'running' or type(analysis.execution) ~= 'table' or analysis.execution.jobId ~= ARGV[1] or analysis.execution.attempt ~= tonumber(ARGV[2]) then
  return { 'stale_attempt' }
end

local provisional = cjson.decode(provisionalPayload)
if provisional.publicationState ~= 'verified' then
  return { 'invalid' }
end

analysis.status = 'succeeded'
analysis.updatedAt = provisional.candidateCompletedAt
analysis.expiresAt = ARGV[3]
analysis.failure = cjson.null
analysis.progress = cjson.decode(ARGV[4])
analysis.resultManifest = cjson.decode(ARGV[5])
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
redis.call('ZADD', KEYS[3], ARGV[6], analysis.id)
redis.call('DEL', KEYS[2])
return { 'succeeded', cjson.encode(analysis) }
