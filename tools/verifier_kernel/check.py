#!/usr/bin/env python3
"""Differential test for the experimental search kernels.

Usage: python3 tools/verifier_kernel/check.py DIRECTORY
DIRECTORY contains reference.so (generated L8 search and queue helper),
c.so, and asm.so. Checks every distance, queued flag, queue slot and return.
The native kernels are experiments; they are not linked into the compiler.
"""
import ctypes as C
from pathlib import Path
import random
import sys


class Term(C.Structure):
    _fields_ = [("path", C.c_void_p), ("obj", C.c_void_p),
                ("is_len", C.c_uint8), ("is_zero", C.c_uint8),
                ("valid", C.c_uint8), ("hash", C.c_uint32)]


class Node(C.Structure):
    _fields_ = [("term", C.c_void_p), ("head", C.c_void_p),
                ("distance", C.c_int64), ("queued", C.c_uint8)]


class Edge(C.Structure):
    _fields_ = [("target", C.c_void_p), ("weight", C.c_int64), ("next", C.c_void_p)]


class Graph(C.Structure):
    _fields_ = [(name, C.c_void_p) for name in
                ("terms", "slots", "occupied", "edges_data", "implicit", "work", "queue")]
    _fields_ += [("small", C.c_uint8), ("nodes", C.c_int64), ("edges", C.c_int64)]


def main():
    directory = Path(sys.argv[1]).resolve()
    kernels = {}
    for name in ("reference", "c", "asm"):
        library = C.CDLL(str(directory / (name + ".so")))
        fn = getattr(library, "bounds_graph_search" if name == "reference" else "kernel_search")
        fn.argtypes = [C.POINTER(Graph), C.c_void_p, C.c_void_p, C.c_int64, C.c_uint8]
        fn.restype = C.c_int
        kernels[name] = fn
    assert (C.sizeof(Term), C.sizeof(Node), C.sizeof(Edge)) == (24, 32, 24)
    assert (Graph.work.offset, Graph.queue.offset, Graph.nodes.offset, Graph.edges.offset) == (40, 48, 64, 72)
    rng = random.Random(8173)
    extremes = [-2**63, 2**63-1, -10**18-1, -10**18, 10**18, 0, -1, 1]
    cases = 600
    for case in range(cases):
        n = rng.randrange(1, 35)
        nodes = (Node * n)()
        terms = (Term * n)()
        edge_count = rng.randrange(0, n * 4)
        edges = (Edge * edge_count)()
        queue = (C.c_void_p * (n + 2))()
        queue[0] = n + 1  # L8 array length precedes its data.
        addresses = [C.addressof(nodes) + i * C.sizeof(Node) for i in range(n)]
        for i in range(n):
            terms[i].is_len = rng.randrange(3) == 0
            nodes[i].term = C.addressof(terms) + i * C.sizeof(Term)
        for i in range(edge_count):
            origin, target = rng.randrange(n), rng.randrange(n)
            edges[i].target = addresses[target]
            edges[i].weight = rng.choice(extremes) if case % 7 == 0 else rng.randrange(-12, 30)
            edges[i].next = nodes[origin].head
            nodes[origin].head = C.addressof(edges) + i * C.sizeof(Edge)
        graph = Graph(C.addressof(terms), None, None, C.addressof(edges), None,
                      C.addressof(nodes), C.addressof(queue) + 8, 1, n, edge_count)
        source = None if case % 4 == 0 else rng.choice(addresses)
        target = source if source and case % 5 == 0 else rng.choice(addresses)
        limit = rng.choice(extremes) if case % 11 == 0 else rng.randrange(-35, 35)
        early = case % 3 != 0
        original_graph = bytes(graph)
        expected = None
        for name, kernel in kernels.items():
            for node in nodes:
                node.distance = 12345
                node.queued = 1
            for i in range(1, n + 2):
                queue[i] = None
            complete = kernel(C.byref(graph), source, target, limit, early)
            actual = (complete, [(v.distance, v.queued) for v in nodes], list(queue))
            assert bytes(graph) == original_graph, (case, name, "graph metadata changed")
            if expected is None:
                expected = actual
            else:
                assert actual == expected, (case, name, actual, expected)
    print(f"{cases} differential cases passed (including overflow, cycles, early exits, and multi-source searches)")


if __name__ == "__main__":
    main()
