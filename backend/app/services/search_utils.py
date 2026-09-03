import math
import re
from collections import Counter
from typing import List, Tuple

class SimpleBM25:
    """
    A standalone, highly performant implementation of the BM25Okapi retrieval algorithm
    with zero external dependencies.
    """
    def __init__(self, corpus: List[str], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus_size = len(corpus)
        self.avg_doc_len = 0.0
        self.corpus = corpus
        
        # Tokenize corpus documents
        self.doc_tokens = []
        self.doc_lens = []
        for doc in corpus:
            tokens = self._tokenize(doc)
            self.doc_tokens.append(tokens)
            self.doc_lens.append(len(tokens))
            
        if self.corpus_size > 0:
            self.avg_doc_len = sum(self.doc_lens) / self.corpus_size
            
        # Calculate document frequency (df) for each term
        self.df = Counter()
        for tokens in self.doc_tokens:
            unique_tokens = set(tokens)
            for token in unique_tokens:
                self.df[token] += 1

    def _tokenize(self, text: str) -> List[str]:
        # Lowercase and split into alphanumeric word tokens
        return re.findall(r'\b\w+\b', text.lower())

    def search(self, query: str, k: int = 5) -> List[Tuple[str, float]]:
        """
        Calculates BM25 scores for all corpus documents against a query,
        returning the top k matches.
        """
        query_tokens = self._tokenize(query)
        scores = []
        
        for idx in range(self.corpus_size):
            doc_len = self.doc_lens[idx]
            doc_tf = Counter(self.doc_tokens[idx])
            score = 0.0
            
            for token in query_tokens:
                if token not in self.df:
                    continue
                    
                # Standard Robertson-Spärck Jones IDF (smoothed)
                df_t = self.df[token]
                idf = math.log((self.corpus_size - df_t + 0.5) / (df_t + 0.5) + 1.0)
                
                # BM25 Term Frequency scaling
                tf = doc_tf[token]
                numerator = tf * (self.k1 + 1.0)
                denominator = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / (self.avg_doc_len or 1.0)))
                score += idf * (numerator / denominator)
                
            scores.append((self.corpus[idx], score))
            
        # Sort by BM25 score descending
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:k]


def reciprocal_rank_fusion(
    dense_results: List[Tuple[str, float]], 
    sparse_results: List[Tuple[str, float]], 
    rrf_k: int = 60,
    top_k: int = 3,
    dense_weight: float = 1.0,
    sparse_weight: float = 1.0
) -> List[str]:
    """
    Combines dense vector search results and sparse keyword search results
    using Weighted Reciprocal Rank Fusion (RRF).
    """
    rrf_scores = {}
    
    # Apply reciprocal rank scoring for dense matches
    for rank, (text, _) in enumerate(dense_results, start=1):
        rrf_scores[text] = rrf_scores.get(text, 0.0) + dense_weight * (1.0 / (rrf_k + rank))
        
    # Apply reciprocal rank scoring for sparse matches
    for rank, (text, _) in enumerate(sparse_results, start=1):
        rrf_scores[text] = rrf_scores.get(text, 0.0) + sparse_weight * (1.0 / (rrf_k + rank))
        
    # Sort distinct text chunks by combined RRF scores descending
    sorted_texts = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)
    return sorted_texts[:top_k]
