import os
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY
from dotenv import load_dotenv

load_dotenv()

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)