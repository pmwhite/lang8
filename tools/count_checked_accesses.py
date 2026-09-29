#!/usr/bin/env python3
"""Count L8 checked indexing operators in source, skipping comments and literals."""

from pathlib import Path


def count_accesses(source: str) -> int:
    count = 0
    i = 0
    while i < len(source):
        if source.startswith("//", i):
            end = source.find("\n", i + 2)
            i = len(source) if end < 0 else end + 1
        elif source.startswith("/*", i):
            end = source.find("*/", i + 2)
            i = len(source) if end < 0 else end + 2
        elif source[i] in "\"'":
            delimiter = '"""' if source.startswith('"""', i) else source[i]
            i += len(delimiter)
            while i < len(source) and not source.startswith(delimiter, i):
                i += 2 if source[i] == "\\" else 1
            i += len(delimiter)
        else:
            if source.startswith("![", i):
                count += 1
                i += 2
            else:
                i += 1
    return count


def count_tree(root: str) -> int:
    # The operator is ASCII; Latin-1 also preserves files with raw non-UTF-8 bytes.
    return sum(
        count_accesses(path.read_text(encoding="latin-1"))
        for path in Path(root).rglob("*.l8")
    )


if __name__ == "__main__":
    source_count = sum(count_tree(root) for root in ("src1", "src2", "stdlib", "programs"))
    print(f"checked accesses: {source_count}")
