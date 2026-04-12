import { Router } from 'express';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/system/speedtest/download
// Requires ?size= parameter in megabytes
router.get('/download', (req, res) => {
  try {
    const sizeMb = parseInt(req.query.size as string || '20', 10);
    const totalBytes = sizeMb * 1024 * 1024;
    const chunkSize = 1024 * 1024; // 1MB chunks

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': totalBytes.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    });

    let bytesSent = 0;
    const chunk = Buffer.alloc(chunkSize, '0'); // filled with zeroes

    const sendChunk = () => {
      let canWrite = true;
      while (bytesSent < totalBytes && canWrite) {
        const bytesToSend = Math.min(chunkSize, totalBytes - bytesSent);
        bytesSent += bytesToSend;
        if (bytesToSend === chunkSize) {
          canWrite = res.write(chunk);
        } else {
          canWrite = res.write(chunk.subarray(0, bytesToSend));
        }
      }

      if (bytesSent < totalBytes) {
        res.once('drain', sendChunk);
      } else {
        res.end();
      }
    };

    sendChunk();
  } catch (error: any) {
    logger.error(`Speedtest Download Error: ${error.message}`, { module: 'Speedtest' });
    res.status(500).end();
  }
});

// POST /api/system/speedtest/upload
router.post('/upload', (req, res) => {
  try {
    // Just consume the stream and discard it
    req.on('data', () => {});
    req.on('end', () => {
      res.json({ success: true });
    });
  } catch (error: any) {
    logger.error(`Speedtest Upload Error: ${error.message}`, { module: 'Speedtest' });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
