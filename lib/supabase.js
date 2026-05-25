// ShiftIn — Supabase Database Service
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import AppState from './state.js';

const isMock = SUPABASE_URL === 'https://YOUR_PROJECT.supabase.co';
let supabase = null;

async function getClient() {
  if (supabase) return supabase;
  if (isMock) return {};
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabase;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function getDb() { return JSON.parse(localStorage.getItem('mock_db') || '{"profiles":[],"jobs":[],"applications":[],"verifications":[]}'); }
function saveDb(db) { localStorage.setItem('mock_db', JSON.stringify(db)); }

// ===================== PROFILES =====================
export async function getProfile(firebaseUid) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    return db.profiles.find(p => p.firebase_uid === firebaseUid) || null;
  }
  const { data, error } = await sb.from('profiles').select('*').eq('firebase_uid', firebaseUid).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function createProfile(profileData) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    profileData.id = 'prof_' + Date.now();
    db.profiles.push(profileData);
    saveDb(db);
    AppState.set({ profile: profileData, role: profileData.role });
    return profileData;
  }
  const { data, error } = await sb.from('profiles').insert(profileData).select().single();
  if (error) throw error;
  AppState.set({ profile: data, role: data.role });
  return data;
}

export async function updateProfile(id, updates) {
  const sb = await getClient();
  updates.updated_at = new Date().toISOString();
  if (isMock) {
    await delay(200);
    const db = getDb();
    const index = db.profiles.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Profile not found');
    db.profiles[index] = { ...db.profiles[index], ...updates };
    saveDb(db);
    AppState.set({ profile: db.profiles[index] });
    return db.profiles[index];
  }
  const { data, error } = await sb.from('profiles').update(updates).eq('id', id).select().single();
  if (error) throw error;
  AppState.set({ profile: data });
  return data;
}

// ===================== JOBS =====================
export async function getJobs(filters = {}) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    let jobs = db.jobs.filter(j => j.status === 'active');
    if (filters.category) jobs = jobs.filter(j => j.category === filters.category);
    if (filters.search) jobs = jobs.filter(j => j.title.toLowerCase().includes(filters.search.toLowerCase()));
    if (filters.limit) jobs = jobs.slice(0, filters.limit);
    // Populate employer
    jobs.forEach(j => {
      const emp = db.profiles.find(p => p.id === j.employer_id);
      if (emp) j.employer = { company_name: emp.company_name, avatar_url: emp.avatar_url, verification_status: emp.verification_status };
    });
    return jobs.sort((a,b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }
  let query = sb.from('jobs').select('*, employer:profiles!employer_id(company_name, avatar_url, verification_status)').eq('status', 'active').order('created_at', { ascending: false });
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.search) query = query.ilike('title', `%${filters.search}%`);
  if (filters.limit) query = query.limit(filters.limit);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getJobById(jobId) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    const job = db.jobs.find(j => j.id === jobId);
    if (job) {
      const emp = db.profiles.find(p => p.id === job.employer_id);
      if (emp) job.employer = { company_name: emp.company_name, avatar_url: emp.avatar_url, company_location: emp.company_location, verification_status: emp.verification_status };
    }
    return job;
  }
  const { data, error } = await sb.from('jobs').select('*, employer:profiles!employer_id(company_name, avatar_url, company_location, verification_status)').eq('id', jobId).single();
  if (error) throw error;
  return data;
}

export async function getEmployerJobs(employerId) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    const jobs = db.jobs.filter(j => j.employer_id === employerId);
    jobs.forEach(j => {
      j.applications = [{ count: db.applications.filter(a => a.job_id === j.id).length }];
    });
    return jobs.sort((a,b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }
  const { data, error } = await sb.from('jobs').select('*, applications(count)').eq('employer_id', employerId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createJob(jobData) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    jobData.id = 'job_' + Date.now();
    jobData.status = jobData.status || 'active';
    jobData.created_at = new Date().toISOString();
    db.jobs.push(jobData);
    saveDb(db);
    return jobData;
  }
  const { data, error } = await sb.from('jobs').insert(jobData).select().single();
  if (error) throw error;
  return data;
}

export async function updateJob(jobId, updates) {
  const sb = await getClient();
  updates.updated_at = new Date().toISOString();
  if (isMock) {
    await delay(200);
    const db = getDb();
    const index = db.jobs.findIndex(j => j.id === jobId);
    if (index === -1) throw new Error('Job not found');
    db.jobs[index] = { ...db.jobs[index], ...updates };
    saveDb(db);
    return db.jobs[index];
  }
  const { data, error } = await sb.from('jobs').update(updates).eq('id', jobId).select().single();
  if (error) throw error;
  return data;
}

// ===================== APPLICATIONS =====================
export async function getStudentApplications(studentId) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    const apps = db.applications.filter(a => a.student_id === studentId);
    apps.forEach(a => {
      const job = db.jobs.find(j => j.id === a.job_id);
      if (job) {
        a.job = { title: job.title, pay_amount: job.pay_amount, pay_unit: job.pay_unit, location: job.location, shift_type: job.shift_type };
        const emp = db.profiles.find(p => p.id === job.employer_id);
        if (emp) a.job.employer = { company_name: emp.company_name, avatar_url: emp.avatar_url };
      }
    });
    return apps.sort((a,b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }
  const { data, error } = await sb.from('applications').select('*, job:jobs(title, pay_amount, pay_unit, location, shift_type, employer:profiles!employer_id(company_name, avatar_url))').eq('student_id', studentId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getJobApplications(jobId) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    const apps = db.applications.filter(a => a.job_id === jobId);
    apps.forEach(a => {
      const stu = db.profiles.find(p => p.id === a.student_id);
      if (stu) a.student = { full_name: stu.full_name, avatar_url: stu.avatar_url, college: stu.college, course: stu.course, skills: stu.skills, verification_status: stu.verification_status };
    });
    return apps.sort((a,b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }
  const { data, error } = await sb.from('applications').select('*, student:profiles!student_id(full_name, avatar_url, college, course, skills, verification_status)').eq('job_id', jobId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getEmployerApplications(employerId) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    const jobs = db.jobs.filter(j => j.employer_id === employerId);
    const jobIds = jobs.map(j => j.id);
    const apps = db.applications.filter(a => jobIds.includes(a.job_id));
    apps.forEach(a => {
      const stu = db.profiles.find(p => p.id === a.student_id);
      if (stu) a.student = { full_name: stu.full_name, avatar_url: stu.avatar_url, college: stu.college, course: stu.course, skills: stu.skills, verification_status: stu.verification_status };
      const job = db.jobs.find(j => j.id === a.job_id);
      if (job) a.job = { title: job.title };
    });
    return apps.sort((a,b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }
  const jobs = await getEmployerJobs(employerId);
  const jobIds = jobs.map(j => j.id);
  if (!jobIds.length) return [];
  const { data: apps, error: err2 } = await sb.from('applications').select('*, student:profiles!student_id(full_name, avatar_url, college, course, skills, verification_status), job:jobs!job_id(title)').in('job_id', jobIds).order('created_at', { ascending: false });
  if (err2) throw err2;
  return apps || [];
}

export async function createApplication(appData) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    appData.id = 'app_' + Date.now();
    appData.status = 'pending';
    appData.created_at = new Date().toISOString();
    db.applications.push(appData);
    saveDb(db);
    return appData;
  }
  const { data, error } = await sb.from('applications').insert(appData).select().single();
  if (error) throw error;
  return data;
}

export async function updateApplicationStatus(appId, status) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    const index = db.applications.findIndex(a => a.id === appId);
    if (index === -1) throw new Error('Application not found');
    db.applications[index].status = status;
    db.applications[index].updated_at = new Date().toISOString();
    saveDb(db);
    return db.applications[index];
  }
  const { data, error } = await sb.from('applications').update({ status, updated_at: new Date().toISOString() }).eq('id', appId).select().single();
  if (error) throw error;
  return data;
}

// ===================== VERIFICATIONS =====================
export async function createVerification(verData) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    verData.id = 'ver_' + Date.now();
    db.verifications.push(verData);
    saveDb(db);
    return verData;
  }
  const { data, error } = await sb.from('verifications').insert(verData).select().single();
  if (error) throw error;
  return data;
}

export async function updateVerification(verId, updates) {
  const sb = await getClient();
  if (isMock) {
    await delay(200);
    const db = getDb();
    const index = db.verifications.findIndex(v => v.id === verId);
    if (index === -1) throw new Error('Verification not found');
    db.verifications[index] = { ...db.verifications[index], ...updates };
    saveDb(db);
    return db.verifications[index];
  }
  const { data, error } = await sb.from('verifications').update(updates).eq('id', verId).select().single();
  if (error) throw error;
  return data;
}

// ===================== FILE UPLOAD =====================
export async function uploadFile(bucket, path, file) {
  if (isMock) {
    await delay(300);
    return 'https://via.placeholder.com/150';
  }
  const sb = await getClient();
  const { data, error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}

// ===================== STATS (Employer) =====================
export async function getEmployerStats(employerId) {
  if (isMock) {
    await delay(200);
    const db = getDb();
    const activeJobs = db.jobs.filter(j => j.employer_id === employerId && j.status === 'active').length;
    const jobIds = db.jobs.filter(j => j.employer_id === employerId).map(j => j.id);
    const totalApplicants = db.applications.filter(a => jobIds.includes(a.job_id)).length;
    return { activeJobs, totalApplicants };
  }
  const sb = await getClient();
  const { count: jobCount } = await sb.from('jobs').select('*', { count: 'exact', head: true }).eq('employer_id', employerId).eq('status', 'active');
  const jobs = await getEmployerJobs(employerId);
  const jobIds = jobs.map(j => j.id);
  let appCount = 0;
  if (jobIds.length) {
    const { count } = await sb.from('applications').select('*', { count: 'exact', head: true }).in('job_id', jobIds);
    appCount = count || 0;
  }
  return { activeJobs: jobCount || 0, totalApplicants: appCount };
}
