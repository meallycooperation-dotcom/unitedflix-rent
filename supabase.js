// Supabase initialization
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';


const SUPABASE_URL = 'https://rejxvwptdcolywamchfm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlanh2d3B0ZGNvbHl3YW1jaGZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2OTU4ODEsImV4cCI6MjA5NTI3MTg4MX0.5W_jeCtv8KB4Vm5w6FHB0mUTycY-XNPa3IkEfqQbYoM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;
