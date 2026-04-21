const { Storage } = require('@google-cloud/storage');

const storage = new Storage();

exports.signUpload = async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { filename, contentType } = req.body || {};
  if (!filename || !contentType) {
    return res.status(400).json({ error: 'filename and contentType are required' });
  }

  const bucket = process.env.GCS_BUCKET;
  if (!bucket) return res.status(500).json({ error: 'GCS_BUCKET not configured' });

  const [signedUrl] = await storage.bucket(bucket).file(filename).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  const publicUrl = `https://storage.googleapis.com/${bucket}/${filename}`;
  res.json({ signedUrl, publicUrl });
};
