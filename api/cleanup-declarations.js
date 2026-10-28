const crypto = require('crypto');
const { HttpError, getCleanupConfig, supabase } = require('../lib/declaration-service');

const RETENTION_DAYS = 30;
const BATCH_SIZE = 100;
const MAX_BATCHES = 10;

function authorize(req, config) {
  const match = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
  if (!match) throw new HttpError(401, 'Autorisation requise.');
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(config.cronSecret);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new HttpError(401, 'Autorisation requise.');
  }
}

async function removeExpiredDeclarations(config) {
  // Start one day early so the daily job can enforce the 30-day maximum.
  const purgeAfterDays = RETENTION_DAYS - 1;
  const cutoff = new Date(Date.now() - purgeAfterDays * 24 * 60 * 60 * 1000).toISOString();
  let deleted = 0;
  let moreToDelete = false;

  for (let batchNumber = 0; batchNumber < MAX_BATCHES; batchNumber++) {
    const params = new URLSearchParams({
      select: 'id,photo_path,ticket_path',
      created_at: `lt.${cutoff}`,
      order: 'created_at.asc',
      limit: String(BATCH_SIZE)
    });
    const rows = await supabase(config, `/rest/v1/declarations?${params}`);
    if (!rows.length) break;

    const photoPaths = rows.flatMap(row => [row.photo_path, row.ticket_path].filter(Boolean));
    if (photoPaths.length) {
      await supabase(config, '/storage/v1/object/declaration-photos', {
        method: 'DELETE',
        body: JSON.stringify({ prefixes: photoPaths })
      });
    }

    const ids = rows.map(row => row.id);
    if (ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      throw new HttpError(500, 'Un dossier expiré contient un identifiant invalide.');
    }
    const deleteParams = new URLSearchParams({ id: `in.(${ids.join(',')})` });
    await supabase(config, `/rest/v1/declarations?${deleteParams}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
    deleted += rows.length;
    moreToDelete = rows.length === BATCH_SIZE;
    if (!moreToDelete) break;
  }

  return { deleted, moreToDelete, retentionDays: RETENTION_DAYS };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const config = getCleanupConfig();
    authorize(req, config);
    return res.status(200).json(await removeExpiredDeclarations(config));
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('Declaration retention cleanup failed:', error.message);
    return res.status(502).json({ error: 'Nettoyage des déclarations impossible. Réessayez.' });
  }
};
