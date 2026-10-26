local datasetPayload = redis.call('GET', KEYS[1])
if not datasetPayload then
  return { 'missing' }
end

local dataset = cjson.decode(datasetPayload)
if dataset.ownerId ~= ARGV[1] or dataset.analysisId ~= ARGV[2] then
  return { 'missing' }
end
if dataset.status ~= 'completing' or dataset.completionClaimId ~= ARGV[3] then
  return { 'invalid' }
end

local analysisPayload = redis.call('GET', KEYS[2])
if not analysisPayload then
  return { 'missing' }
end
local analysis = cjson.decode(analysisPayload)
if analysis.status ~= 'uploading' and not (analysis.status == 'ready' and dataset.replaceDatasetId and dataset.replaceDatasetId ~= cjson.null) then
  return { 'invalid_analysis' }
end

local manifest = { datasets = {} }
local manifestPayload = redis.call('GET', KEYS[3])
if manifestPayload then
  manifest = cjson.decode(manifestPayload)
end
local replaced = nil
local retained = {}
for _, attached in ipairs(manifest.datasets) do
  if attached.dataset.id == dataset.id then
    return { 'attached', cjson.encode(attached.dataset) }
  end
  if dataset.replaceDatasetId and dataset.replaceDatasetId ~= cjson.null and attached.dataset.id == dataset.replaceDatasetId then
    if attached.dataset.kind ~= dataset.kind then return { 'replacement_stale' } end
    replaced = attached
  else
    retained[#retained + 1] = attached
  end
  if (not dataset.replaceDatasetId or dataset.replaceDatasetId == cjson.null) and dataset.kind == 'occurrence' and attached.dataset.kind == 'occurrence' then
    return { 'occurrence_taken' }
  end
end
if dataset.replaceDatasetId and dataset.replaceDatasetId ~= cjson.null and replaced == nil then
  return { 'replacement_stale' }
end

local attached = cjson.decode(ARGV[4])
retained[#retained + 1] = attached
manifest.datasets = retained
redis.call('SET', KEYS[3], cjson.encode(manifest))
analysis.status = 'uploading'
analysis.inputRevision = (analysis.inputRevision or 0) + 1
analysis.configuration = nil
analysis.configurationRevision = 0
analysis.configurationFingerprint = nil
analysis.inputProfile = nil
analysis.preflight = nil
analysis.updatedAt = attached.attachedAt
if dataset.kind == 'occurrence' then analysis.occurrenceDatasetId = dataset.id end
redis.call('SET', KEYS[2], cjson.encode(analysis), 'KEEPTTL')
if replaced then
  local objectKeys = {}
  for _, file in ipairs(replaced.files) do objectKeys[#objectKeys + 1] = file.storageKey end
  local cleanupId = 'cl_replace_' .. dataset.analysisId .. '_' .. replaced.dataset.id
  local cleanup = {
    id = cleanupId,
    analysisId = dataset.analysisId,
    objectKeys = objectKeys,
    multipartUploads = {},
    attempt = 0,
    nextAttemptAt = ARGV[5],
    createdAt = ARGV[5]
  }
  redis.call('SET', KEYS[8] .. cleanupId, cjson.encode(cleanup))
  redis.call('ZADD', KEYS[9], ARGV[6], cleanupId)
end
for _, uploadId in ipairs(dataset.uploadIds) do
  redis.call('DEL', KEYS[6] .. uploadId)
end
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[5], dataset.id)
redis.call('SREM', KEYS[7], dataset.id)
return { 'attached', cjson.encode(attached.dataset) }
