import os
from contextvars import ContextVar
from supabase import create_client, Client, ClientOptions
from config import SUPABASE_URL, SUPABASE_KEY
from dotenv import load_dotenv

load_dotenv()

# Global default client (unscoped)
_supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Context variable to hold the scoped client for the current request
scoped_client_var: ContextVar[Client] = ContextVar("scoped_client", default=_supabase)

# Context variable to hold the current user id
current_user_id_var: ContextVar[str] = ContextVar("current_user_id", default="")

def get_client() -> Client:
    """Returns the Supabase client scoped to the current user's request context."""
    return scoped_client_var.get()

def create_scoped_client(jwt_token: str) -> Client:
    """Creates a new client instance authenticated with the user's JWT."""
    return create_client(
        SUPABASE_URL,
        SUPABASE_KEY,
        options=ClientOptions(headers={"Authorization": f"Bearer {jwt_token}"})
    )