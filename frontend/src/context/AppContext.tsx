import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type DocType = "pdf" | "md" | "txt" | "docx";
export type IndexStatus =
  | "queued"
  | "extracting"
  | "ocr"
  | "embedding"
  | "indexed"
  | "error";

export interface Document {
  id: string;
  filename: string;
  type: DocType;
  chunkCount: number;
  status: IndexStatus;
  size: number;
  indexedAt?: Date;
  avgIndexTime?: number;
  /** Pre-computed similarities to other docs (docId → score 0-1) */
  similarities?: Record<string, number>;
}

export interface Citation {
  filename: string;
  page?: number;
  docId: string;
  chunkIndex?: number;
  ref?: number;
}

export interface SourceChunk {
  docId: string;
  filename: string;
  type: DocType;
  confidence: number; // 0-1
  snippet: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  sources?: SourceChunk[];
  chunkCount?: number;
  docCount?: number;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface AppState {
  documents: Document[];
  messages: Message[];
  isGraphOpen: boolean;
  isUploadOpen: boolean;
  isQuerying: boolean;
  activeDocId: string | null;
  sessionName: string;
  searchQuery: string;
  totalChunks: number;
}

// ── Actions ────────────────────────────────────────────────────────────────────

type AppAction =
  | { type: "ADD_DOCUMENT"; doc: Document }
  | { type: "UPDATE_DOCUMENT"; id: string; patch: Partial<Document> }
  | { type: "REMOVE_DOCUMENT"; id: string }
  | { type: "ADD_MESSAGE"; msg: Message }
  | { type: "UPDATE_MESSAGE"; id: string; patch: Partial<Message> }
  | { type: "SET_GRAPH_OPEN"; open: boolean }
  | { type: "SET_UPLOAD_OPEN"; open: boolean }
  | { type: "SET_QUERYING"; querying: boolean }
  | { type: "SET_ACTIVE_DOC"; docId: string | null }
  | { type: "SET_SESSION_NAME"; name: string }
  | { type: "SET_SEARCH_QUERY"; query: string };

// ── Reducer ────────────────────────────────────────────────────────────────────

function computeTotalChunks(docs: Document[]) {
  return docs.reduce((sum, d) => sum + d.chunkCount, 0);
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_DOCUMENT": {
      const docs = [...state.documents, action.doc];
      return { ...state, documents: docs, totalChunks: computeTotalChunks(docs) };
    }
    case "UPDATE_DOCUMENT": {
      const docs = state.documents.map((d) =>
        d.id === action.id ? { ...d, ...action.patch } : d
      );
      return { ...state, documents: docs, totalChunks: computeTotalChunks(docs) };
    }
    case "REMOVE_DOCUMENT": {
      const docs = state.documents.filter((d) => d.id !== action.id);
      return { ...state, documents: docs, totalChunks: computeTotalChunks(docs) };
    }
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.msg] };
    case "UPDATE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, ...action.patch } : m
        ),
      };
    case "SET_GRAPH_OPEN":
      return { ...state, isGraphOpen: action.open };
    case "SET_UPLOAD_OPEN":
      return { ...state, isUploadOpen: action.open };
    case "SET_QUERYING":
      return { ...state, isQuerying: action.querying };
    case "SET_ACTIVE_DOC":
      return { ...state, activeDocId: action.docId };
    case "SET_SESSION_NAME":
      return { ...state, sessionName: action.name };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.query };
    default:
      return state;
  }
}

// ── Initial State ──────────────────────────────────────────────────────────────

const initialState: AppState = {
  documents: [],
  messages: [],
  isGraphOpen: false,
  isUploadOpen: false,
  isQuerying: false,
  activeDocId: null,
  sessionName: "Research Session",
  searchQuery: "",
  totalChunks: 0,
};

// ── Context ────────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  // Convenience helpers
  addDocument: (doc: Document) => void;
  updateDocument: (id: string, patch: Partial<Document>) => void;
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  setGraphOpen: (open: boolean) => void;
  setUploadOpen: (open: boolean) => void;
  setQuerying: (v: boolean) => void;
  setActiveDoc: (id: string | null) => void;
  setSessionName: (name: string) => void;
  setSearchQuery: (q: string) => void;
  filteredDocuments: Document[];
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const addDocument = useCallback((doc: Document) => dispatch({ type: "ADD_DOCUMENT", doc }), []);
  const updateDocument = useCallback((id: string, patch: Partial<Document>) =>
    dispatch({ type: "UPDATE_DOCUMENT", id, patch }), []);
  const addMessage = useCallback((msg: Message) => dispatch({ type: "ADD_MESSAGE", msg }), []);
  const updateMessage = useCallback((id: string, patch: Partial<Message>) =>
    dispatch({ type: "UPDATE_MESSAGE", id, patch }), []);
  const setGraphOpen = useCallback((open: boolean) => dispatch({ type: "SET_GRAPH_OPEN", open }), []);
  const setUploadOpen = useCallback((open: boolean) => dispatch({ type: "SET_UPLOAD_OPEN", open }), []);
  const setQuerying = useCallback((querying: boolean) => dispatch({ type: "SET_QUERYING", querying }), []);
  const setActiveDoc = useCallback((docId: string | null) => dispatch({ type: "SET_ACTIVE_DOC", docId }), []);
  const setSessionName = useCallback((name: string) => dispatch({ type: "SET_SESSION_NAME", name }), []);
  const setSearchQuery = useCallback((query: string) => dispatch({ type: "SET_SEARCH_QUERY", query }), []);

  const filteredDocuments = state.searchQuery
    ? state.documents.filter((d) =>
        d.filename.toLowerCase().includes(state.searchQuery.toLowerCase())
      )
    : state.documents;

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        addDocument,
        updateDocument,
        addMessage,
        updateMessage,
        setGraphOpen,
        setUploadOpen,
        setQuerying,
        setActiveDoc,
        setSessionName,
        setSearchQuery,
        filteredDocuments,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
