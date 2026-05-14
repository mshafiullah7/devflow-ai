'rag.py — ChromaDB-based codebase retriever for devflow-agent'

# NOTE: Add .devflow_chroma/ to your project .gitignore — the index is
# regenerated on demand and should not be committed to version control.

from pathlib import Path

CHROMA_DIR_NAME = '.devflow_chroma'
COLLECTION_NAME = 'codebase'
CHUNK_SIZE      = 60   # lines per chunk
CHUNK_OVERLAP   = 10   # lines of overlap between consecutive chunks

INDEX_EXTS = {
    '.cs', '.py', '.ts', '.tsx', '.js', '.jsx',
    '.dart', '.kt', '.java', '.go', '.rs',
}

SKIP_DIRS = {
    '.git', 'build', 'dist', 'out', 'node_modules',
    '__pycache__', '.dart_tool', '.gradle',
    '.devflow_chroma', '.venv', 'venv', 'env', '.env',
    'bin', 'obj', 'packages', '.idea', '.vscode',
}


class CodeContextRetriever:
    """
    Indexes source files into a local ChromaDB collection and retrieves
    semantically relevant snippets for a given task description.

    The index is persisted at <project_root>/.devflow_chroma/ and reused
    across agent invocations. Use index() for a full rebuild, and
    reindex_changed() for an incremental update after code generation.
    """

    def __init__(self, project_root: str):
        self.root          = Path(project_root).resolve()
        self._chroma_path  = str(self.root / CHROMA_DIR_NAME)
        self._client       = None
        self._collection   = None

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    def _get_collection(self):
        if self._client is None:
            import chromadb
            self._client     = chromadb.PersistentClient(path=self._chroma_path)
            # No embedding_function arg → uses DefaultEmbeddingFunction
            # which auto-loads all-MiniLM-L6-v2 from sentence-transformers.
            self._collection = self._client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={'hnsw:space': 'cosine'},
            )
        return self._collection

    @staticmethod
    def _chunk_file(path: Path, root: Path) -> list:
        """
        Split a source file into overlapping line-based chunks.
        Returns list of {"id", "document", "metadata"} dicts.
        """
        try:
            text = path.read_text(encoding='utf-8', errors='replace')
        except OSError:
            return []

        lines = text.splitlines()
        rel   = str(path.relative_to(root)).replace('\\', '/')
        chunks = []
        i = 0
        chunk_idx = 0

        while i < len(lines):
            end   = min(i + CHUNK_SIZE, len(lines))
            chunk = '\n'.join(lines[i:end])
            if chunk.strip():
                # Prepend the file path so the model sees it in every snippet
                chunks.append({
                    'id':       f'{rel}::chunk_{chunk_idx}',
                    'document': f'// File: {rel}\n{chunk}',
                    'metadata': {
                        'file':       rel,
                        'start_line': i + 1,
                        'end_line':   end,
                    },
                })
            chunk_idx += 1
            i += CHUNK_SIZE - CHUNK_OVERLAP

        return chunks

    def _collect_source_files(self) -> list:
        files = []
        for p in self.root.rglob('*'):
            if not p.is_file():
                continue
            if p.suffix.lower() not in INDEX_EXTS:
                continue
            parts = set(p.relative_to(self.root).parts)
            if parts & SKIP_DIRS:
                continue
            files.append(p)
        return files

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    def index(self, verbose: bool = False) -> int:
        """
        Full index build. Walks all source files in the project and upserts
        chunks into ChromaDB. Idempotent — safe to call multiple times.
        Returns the number of chunks indexed.
        """
        col   = self._get_collection()
        files = self._collect_source_files()

        all_ids, all_docs, all_metas = [], [], []
        for path in files:
            for chunk in self._chunk_file(path, self.root):
                all_ids.append(chunk['id'])
                all_docs.append(chunk['document'])
                all_metas.append(chunk['metadata'])

        if not all_ids:
            if verbose:
                print('► RAG: no source files found to index', flush=True)
            return 0

        col.upsert(ids=all_ids, documents=all_docs, metadatas=all_metas)

        if verbose:
            print(
                f'► RAG: indexed {len(all_ids)} chunks from {len(files)} files',
                flush=True,
            )
        return len(all_ids)

    def reindex_changed(self, verbose: bool = False) -> int:
        """
        Incremental re-index using git diff to detect changed files.
        Only chunks for modified/untracked source files are updated.
        Falls back to full index() if the project is not a git repo.
        Returns the number of chunks upserted.
        """
        try:
            import git
            repo = git.Repo(str(self.root), search_parent_directories=True)
        except Exception:
            if verbose:
                print('► RAG: not a git repo — falling back to full index', flush=True)
            return self.index(verbose=verbose)

        col = self._get_collection()
        changed_paths: set = set()

        try:
            for diff in repo.index.diff(None):        # unstaged vs index
                changed_paths.add(self.root / diff.a_path)
        except Exception:
            pass

        try:
            for diff in repo.index.diff('HEAD'):      # staged vs HEAD
                changed_paths.add(self.root / diff.a_path)
        except Exception:
            pass

        try:
            for rel in repo.untracked_files:
                changed_paths.add(self.root / rel)
        except Exception:
            pass

        source_changed = [
            p for p in changed_paths
            if p.exists() and p.is_file() and p.suffix.lower() in INDEX_EXTS
        ]

        if not source_changed:
            if verbose:
                print('► RAG: no changed source files to re-index', flush=True)
            return 0

        all_ids, all_docs, all_metas = [], [], []
        for path in source_changed:
            rel = str(path.relative_to(self.root)).replace('\\', '/')

            # Remove stale chunks for this file before upserting fresh ones
            try:
                existing = col.get(where={'file': rel})
                if existing['ids']:
                    col.delete(ids=existing['ids'])
            except Exception:
                pass

            for chunk in self._chunk_file(path, self.root):
                all_ids.append(chunk['id'])
                all_docs.append(chunk['document'])
                all_metas.append(chunk['metadata'])

        if all_ids:
            col.upsert(ids=all_ids, documents=all_docs, metadatas=all_metas)

        if verbose:
            print(
                f'► RAG: re-indexed {len(source_changed)} changed files '
                f'({len(all_ids)} chunks)',
                flush=True,
            )
        return len(all_ids)

    def query(self, text: str, n_results: int = 5) -> str:
        """
        Semantic search over the indexed codebase.
        Returns a markdown-formatted string for injection into the system prompt,
        or an empty string if the collection is empty.
        """
        col = self._get_collection()

        try:
            count = col.count()
        except Exception:
            count = 0

        if count == 0:
            return ''

        results = col.query(
            query_texts=[text],
            n_results=min(n_results, count),
        )

        if not results or not results['documents'] or not results['documents'][0]:
            return ''

        lines = ['## Semantically relevant code snippets (RAG)']
        for doc, meta in zip(results['documents'][0], results['metadatas'][0]):
            lines.append(
                f"\n### {meta.get('file', '?')} "
                f"(lines {meta.get('start_line')}–{meta.get('end_line')})"
            )
            lines.append('```')
            lines.append(doc)
            lines.append('```')

        return '\n'.join(lines)
