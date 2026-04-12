import { Router } from 'express';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const router = Router();
const CRON_FILE = path.join(process.env.HOME || '/root', '.clawos', 'cron_jobs.json');

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  lastRun?: string;
  lastStatus?: 'success' | 'error';
  lastLog?: string;
}

let activeJobs: { [id: string]: any } = {};
let jobsConfig: CronJob[] = [];

// Initialize cron jobs on startup
export const initCronJobs = async () => {
  try {
    try {
      const data = await fs.readFile(CRON_FILE, 'utf-8');
      jobsConfig = JSON.parse(data);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        jobsConfig = [];
        await fs.mkdir(path.dirname(CRON_FILE), { recursive: true });
        await fs.writeFile(CRON_FILE, JSON.stringify([]));
      }
    }

    jobsConfig.forEach(job => {
      if (job.enabled) {
        scheduleJob(job);
      }
    });
    logger.info(`Loaded ${jobsConfig.length} cron jobs`, { module: 'Cron' });
  } catch (err: any) {
    logger.error(`Failed to init cron jobs: ${err.message}`, { module: 'Cron' });
  }
};

const saveJobs = async () => {
  await fs.writeFile(CRON_FILE, JSON.stringify(jobsConfig, null, 2));
};

const scheduleJob = (job: CronJob) => {
  if (activeJobs[job.id]) {
    activeJobs[job.id].stop();
  }
  
  if (!job.enabled) return;

  if (!cron.validate(job.schedule)) {
    logger.error(`Invalid cron schedule: ${job.schedule} for job ${job.name}`, { module: 'Cron' });
    return;
  }

  activeJobs[job.id] = cron.schedule(job.schedule, async () => {
    logger.info(`Running job: ${job.name}`, { module: 'Cron' });
    job.lastRun = new Date().toISOString();
    
    try {
      const { stdout, stderr } = await execPromise(job.command);
      job.lastStatus = 'success';
      job.lastLog = stdout || stderr || 'Executed successfully with no output';
    } catch (err: any) {
      job.lastStatus = 'error';
      job.lastLog = err.message || 'Execution failed';
      logger.error(`Job failed: ${job.name} - ${err.message}`, { module: 'Cron' });
    }
    await saveJobs();
  });
};

router.get('/', async (req, res) => {
  res.json({ success: true, data: jobsConfig });
});

router.post('/', async (req, res) => {
  try {
    const newJob: CronJob = {
      id: Date.now().toString(),
      name: req.body.name || 'Unnamed Task',
      schedule: req.body.schedule || '0 0 * * *', // daily default
      command: req.body.command || '',
      enabled: req.body.enabled ?? true
    };
    
    if (!cron.validate(newJob.schedule)) {
      return res.status(400).json({ success: false, error: 'Invalid cron expression' });
    }

    jobsConfig.push(newJob);
    await saveJobs();
    scheduleJob(newJob);
    
    res.json({ success: true, data: newJob });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const index = jobsConfig.findIndex(j => j.id === req.params.id);
    if (index === -1) return res.status(404).json({ success: false, error: 'Job not found' });

    const updatedJob = { ...jobsConfig[index], ...req.body };
    
    if (!cron.validate(updatedJob.schedule)) {
      return res.status(400).json({ success: false, error: 'Invalid cron expression' });
    }

    jobsConfig[index] = updatedJob;
    await saveJobs();
    scheduleJob(updatedJob);
    
    res.json({ success: true, data: updatedJob });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const index = jobsConfig.findIndex(j => j.id === req.params.id);
    if (index === -1) return res.status(404).json({ success: false, error: 'Job not found' });

    if (activeJobs[req.params.id]) {
      activeJobs[req.params.id].stop();
      delete activeJobs[req.params.id];
    }

    jobsConfig.splice(index, 1);
    await saveJobs();
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/run', async (req, res) => {
  try {
    const job = jobsConfig.find(j => j.id === req.params.id);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    // Run immediately asynchronously
    job.lastRun = new Date().toISOString();
    execPromise(job.command)
      .then(({ stdout, stderr }) => {
        job.lastStatus = 'success';
        job.lastLog = stdout || stderr || 'Executed successfully';
        saveJobs();
      })
      .catch((err) => {
        job.lastStatus = 'error';
        job.lastLog = err.message || 'Execution failed';
        saveJobs();
      });

    res.json({ success: true, message: 'Job triggered' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
