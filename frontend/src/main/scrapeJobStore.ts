import Store from 'electron-store';
import { ScrapeJobState } from '../shared/types';

interface ScrapeJobStoreSchema {
  scrapeJobs: Record<string, ScrapeJobState>;
}

const jobStore = new Store<ScrapeJobStoreSchema>({
  name: 'scrape-job',
  defaults: {
    scrapeJobs: {},
  },
});

export function getAllScrapeJobs(): Record<string, ScrapeJobState> {
  return jobStore.get('scrapeJobs') ?? {};
}

export function getScrapeJob(jobId: string): ScrapeJobState | null {
  const jobs = getAllScrapeJobs();
  return jobs[jobId] ?? null;
}

export function saveScrapeJob(job: ScrapeJobState): void {
  const jobs = getAllScrapeJobs();
  jobs[job.jobId] = job;
  jobStore.set('scrapeJobs', jobs);
}

export function clearScrapeJob(jobId: string): void {
  const jobs = getAllScrapeJobs();
  delete jobs[jobId];
  jobStore.set('scrapeJobs', jobs);
}

export function clearAllScrapeJobs(): void {
  jobStore.set('scrapeJobs', {});
}
