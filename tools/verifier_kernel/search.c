/* Experimental equivalent of bounds_graph_search. Compile with -fwrapv.
 * No allocation, changed budgets, reordered edges, or new proof rules.
 * L8 slices point to data with their length in the preceding machine word.
 */
#include <stdint.h>
#include <stddef.h>

typedef struct Node Node;
typedef struct Edge Edge;
typedef struct {
    void *path, *obj;
    uint8_t is_len, is_zero, valid;
    uint32_t hash;
} Term;
struct Node { Term *term; Edge *head; int64_t distance; uint8_t queued; };
struct Edge { Node *target; int64_t weight; Edge *next; };
typedef struct {
    Term *terms;
    void *slots, *occupied_slots, *row_edges, *implicit_edges;
    Node *work;
    Node **queue;
    uint8_t small_weights;
    int64_t nodes, edges;
} Graph;
_Static_assert(sizeof(Term) == 24 && offsetof(Term, is_len) == 16, "term layout");
_Static_assert(sizeof(Node) == 32 && offsetof(Node, queued) == 24, "node layout");
_Static_assert(sizeof(Edge) == 24 && offsetof(Edge, next) == 16, "edge layout");
_Static_assert(offsetof(Graph, work) == 40 && offsetof(Graph, queue) == 48 &&
               offsetof(Graph, nodes) == 64 && offsetof(Graph, edges) == 72, "graph layout");

int kernel_search(Graph *g, Node *source, Node *target, int64_t limit, uint8_t early) {
    const int64_t infinity = INT64_C(1000000000000000000);
    Node **queue = g->queue;
    int64_t size = ((int64_t *)queue)[-1];
    for (int64_t i = 0; i < g->nodes; ++i) {
        g->work[i].distance = infinity;
        g->work[i].queued = 0;
    }
    int64_t read = 0, write = 0;
    if (source) {
        source->distance = 0;
        source->queued = 1;
        queue[0] = source;
        write = size == 1 ? 0 : 1;
    } else {
        for (int64_t i = 0; i < g->nodes; ++i) {
            if (g->terms[i].is_len) {
                Node *node = &g->work[i];
                node->distance = 0;
                node->queued = 1;
                queue[write] = node;
                if (++write >= size) write = 0;
            }
        }
    }
    int64_t budget = (g->nodes + g->edges + 1) * 64;
    if (budget > 262144) budget = 262144;
    if (source == target && early && limit >= 0) return 0;
    while (read != write && budget > 0) {
        Node *from = queue[read];
        if (++read >= size) read = 0;
        from->queued = 0;
        int64_t base = from->distance;
        for (Edge *edge = from->head; edge && budget > 0; edge = edge->next) {
            --budget;
            Node *to = edge->target;
            int64_t value = base + edge->weight;
            if (value < to->distance && value > -infinity) {
                to->distance = value;
                if (to == target && early && value <= limit) return 0;
                if (!to->queued) {
                    queue[write] = to;
                    if (++write >= size) write = 0;
                    to->queued = 1;
                }
            }
        }
    }
    return read == write && budget > 0;
}
