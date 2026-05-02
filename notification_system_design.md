# Campus Notifications Microservice — System Design

---

# Stage 1

The frontend colleague needs a clear API contract to show notifications when a student is logged in. Here's what I think the platform needs to support and how the endpoints should look.

## Core Actions

The main things a user would do:

1. View all their notifications
2. View a single notification
3. Mark one as read
4. Mark all as read
5. Check unread count (for the badge icon)
6. Filter by type (Placement / Event / Result)
7. Create a notification — admin/system only
8. Delete a notification — admin only

## REST API Endpoints

### GET /api/notifications

Fetch all notifications for the logged-in student. Supports filtering and pagination.

**Headers:**
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Query params** (all optional):

| param | type | description |
|-------|------|-------------|
| type | string | Placement, Event, or Result |
| isRead | boolean | filter by read status |
| page | int | default 1 |
| limit | int | default 20 |
| order | string | asc or desc (default desc) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
        "type": "Result",
        "message": "mid-sem",
        "timestamp": "2026-04-22 17:51:30",
        "isRead": false
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

### GET /api/notifications/:id

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
    "type": "Result",
    "message": "mid-sem",
    "timestamp": "2026-04-22 17:51:30",
    "isRead": false
  }
}
```

**Response 404:**
```json
{ "success": false, "error": "Notification not found" }
```

### PATCH /api/notifications/:id/read

Mark a single notification as read.

**Response 200:**
```json
{ "success": true, "message": "Notification marked as read" }
```

### PATCH /api/notifications/read-all

**Response 200:**
```json
{
  "success": true,
  "message": "All notifications marked as read",
  "data": { "updatedCount": 12 }
}
```

### GET /api/notifications/unread-count

Used for the notification bell badge.

**Response 200:**
```json
{ "success": true, "data": { "unreadCount": 12 } }
```

### POST /api/notifications (admin/system only)

**Request body:**
```json
{
  "studentId": "student-uuid",
  "type": "Placement",
  "message": "Google Inc. hiring for SDE-1"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "new-notification-uuid",
    "type": "Placement",
    "message": "Google Inc. hiring for SDE-1",
    "timestamp": "2026-05-02 10:30:00",
    "isRead": false
  }
}
```

### DELETE /api/notifications/:id (admin only)

**Response 200:**
```json
{ "success": true, "message": "Notification deleted" }
```

## Error Format

All errors return the same structure so the frontend can handle them consistently:

```json
{
  "success": false,
  "error": "some message",
  "statusCode": 400
}
```

Status codes used: 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error).

## Real-Time Notifications

I went with **WebSocket (Socket.io)** for real-time delivery. The alternative was SSE but WebSocket felt more appropriate since we also need client-to-server events (marking as read).

**How it works:**

When a student logs in, the frontend opens a WebSocket connection:
```
ws://server-host/notifications?token=<jwt_token>
```

The server validates the JWT on handshake. Each student joins a room based on their `studentId` — this way notifications can be targeted per student.

**Events:**

| event | direction | payload |
|-------|-----------|---------|
| `notification:new` | server → client | `{ id, type, message, timestamp }` |
| `notification:read` | client → server | `{ notificationId }` |
| `notification:read_all` | client → server | `{}` |
| `notification:count` | server → client | `{ unreadCount }` |

If the WebSocket drops, the client falls back to polling every 30 seconds.

**Flow:**
```
student logs in → open WebSocket → join room(studentId)
                                         ↓
system sends notification → save to DB → emit to room(studentId)
                                         ↓
                               client gets "notification:new"
                               UI updates without page refresh
```

## Notification JSON Schema

```json
{
  "id": "string (UUID)",
  "studentId": "string (UUID)",
  "type": "Placement | Event | Result",
  "message": "string",
  "isRead": "boolean (default false)",
  "timestamp": "datetime",
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

---

# Stage 2

## DB Choice: PostgreSQL

I went with PostgreSQL over MongoDB here. The data model is pretty fixed — notifications have a consistent structure (id, studentId, type, message, isRead, timestamp). There's no real reason to go NoSQL when the schema won't change much.

Also, the queries we need (filter by type, filter unread, sort by date) are all well suited to SQL. MongoDB would work too but I don't think the flexibility justifies the added complexity for this use case.

Other reasons I chose Postgres:
- native ENUM type for notification types
- partial indexes (huge for the "get unread" query)
- supports read replicas and partitioning if we scale
- works well with Node.js ecosystem (pg, Prisma, etc.)

## Database Schema

```sql
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    roll_no VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TYPE notification_type AS ENUM ('Placement', 'Event', 'Result');

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- indexes added based on the query patterns we expect
CREATE INDEX idx_notif_student ON notifications(student_id);
CREATE INDEX idx_notif_student_unread ON notifications(student_id, created_at DESC)
    WHERE is_read = FALSE;
CREATE INDEX idx_notif_type ON notifications(type);
```

## Problems at Scale

**Slow reads** — without indexes, querying 5M rows per student is a full table scan. Fix: composite + partial indexes (see Stage 3).

**Table bloat** — high volume of UPDATE (marking read) causes dead tuples. Fix: tune `autovacuum`, partition table by month.

**Too many connections** — 50K students all connecting to the DB directly. Fix: PgBouncer for connection pooling.

**Write spikes** — result day, placement day, everyone gets a notification at once. Fix: batch inserts, queue-based writes.

**Storage growing unbounded** — old notifications piling up. Fix: archive or delete notifications older than 6 months.

## SQL Queries

**Get notifications for a student (paginated):**
```sql
SELECT id, type, message, is_read, timestamp
FROM notifications
WHERE student_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

**Mark one as read:**
```sql
UPDATE notifications
SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND student_id = $2;
```

**Mark all as read:**
```sql
UPDATE notifications
SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE student_id = $1 AND is_read = FALSE;
```

**Unread count:**
```sql
SELECT COUNT(*) AS unread_count
FROM notifications
WHERE student_id = $1 AND is_read = FALSE;
```

**Create notification:**
```sql
INSERT INTO notifications (student_id, type, message, timestamp)
VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
RETURNING id, type, message, is_read, timestamp;
```

**Filter by type:**
```sql
SELECT id, type, message, is_read, timestamp
FROM notifications
WHERE student_id = $1 AND type = $2
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;
```

**Delete:**
```sql
DELETE FROM notifications WHERE id = $1;
```

---

# Stage 3

## The slow query

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

**Why is it slow?**

With 5 million rows and no index on `studentID`, this is a full sequential scan — the DB reads through every single row to find the ones belonging to student 1042. At 50K students with ~100 notifications each, that's 5M row reads for what should be a small result set.

`ORDER BY createdAt DESC` makes it worse because after scanning it also has to sort the results.

**Is the query logically correct?** Yes, it returns the right data. It's just doing it the slow way.

**What I'd change:**

```sql
SELECT id, type, message, timestamp
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

- Replace `SELECT *` with only the columns we actually need — less data to transfer
- Add a proper index (see below)

## Indexing

A colleague suggested adding indexes on every column "to be safe" — this is not good advice.

Every index:
- takes up disk space (significant at 5M rows)
- slows down every INSERT and UPDATE because all indexes need updating
- standalone index on `isRead` (which is only true/false) gives almost no benefit

What to actually do — add a **partial index** on just the rows that matter:

```sql
CREATE INDEX idx_notif_unread
ON notifications(studentID, createdAt DESC)
WHERE isRead = false;
```

This only indexes unread notifications. Since most notifications eventually get read, this index stays small and fast. Query goes from O(n) full scan to O(log n) index lookup.

## Placement notifications in last 7 days

```sql
SELECT id, type, message, timestamp, is_read
FROM notifications
WHERE type = 'Placement'
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY created_at DESC;
```

Supporting index:
```sql
CREATE INDEX idx_notif_type_date ON notifications(type, created_at DESC);
```

---

# Stage 4

## Problem

Notifications are fetched fresh from the DB on every page load for every student. With 50K students refreshing their dashboards, the DB can't keep up.

## What I'd suggest

**Redis cache for notification data**

Cache each student's unread notifications in Redis with a short TTL. Most students refresh the page multiple times without any new notifications — no reason to hit the DB every time.

```
key: notifications:{studentId}:unread
value: JSON array
TTL: 60 seconds
```

Flow:
1. Page loads → check Redis for `notifications:{studentId}:unread`
2. Cache hit → return immediately, no DB query
3. Cache miss → query DB → store in Redis → return

When a notification is created or marked read → invalidate that student's cache key.

This alone should cut DB queries by ~80-90% because most page loads happen when nothing has changed.

**Tradeoffs:**
- Data can be up to 60 seconds stale (acceptable for notifications)
- Adds Redis infrastructure to maintain
- Cache invalidation logic needs to be correct or you'll show stale data

**WebSocket instead of polling**

If we implement the WebSocket approach from Stage 1, we stop fetching on every page load entirely. Initial load does one DB query, then subsequent updates are pushed to the client. Way better than polling.

**HTTP cache headers**

For the REST endpoint, add `Cache-Control: private, max-age=30` and ETags. Browser caches the response and only re-fetches if the ETag changed. Cuts round trips without any server-side changes.

**Pagination**

Don't fetch all notifications at once. Load 20 at a time. This makes each query faster and reduces the data transferred per request. Use cursor-based pagination for better performance than OFFSET at large pages.

---

# Stage 5

## Problems with the current implementation

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)
        save_to_db(student_id, message)
        push_to_app(student_id, message)
```

**It's sequential.** 50,000 students, one at a time. If each takes even 50ms, that's 42 minutes. Way too slow.

**No retry logic.** Logs show `send_email` failed at student #200. The 200 students who didn't get the email — they're just silently missed. There's no way to retry just the failed ones.

**Email and DB are tightly coupled.** If the email API is slow or times out, the DB write and push are blocked waiting for it. These should happen independently.

**No atomicity guarantee.** If email succeeds but DB insert fails, the notification state is inconsistent — the student got an email but has no record of the notification in the app.

## Should DB save and email happen together?

No. The DB save is fast, local, and reliable. The email is an external API call that can fail for many reasons. Coupling them means the DB write (your source of truth) depends on an external service. That's backwards.

Save to DB first. Enqueue the email separately. If the email fails, you can retry from the queue without touching the DB again.

## Redesigned approach

Use a message queue (RabbitMQ or similar). The `notify_all` function does two things: batch insert to DB, then publish jobs to a queue. Email workers pick up jobs independently and handle retries.

```python
function notify_all(student_ids: array, message: string):
    # batch insert all at once - one query, not 50K
    rows = []
    for student_id in student_ids:
        rows.append({ student_id, message, type: "Placement", is_read: false })
    
    inserted = db.batch_insert("notifications", rows)

    # enqueue delivery jobs - non-blocking
    for i, student_id in enumerate(student_ids):
        email_queue.publish({
            notification_id: inserted[i].id,
            student_id: student_id,
            message: message,
            retries: 0
        })
        push_queue.publish({
            notification_id: inserted[i].id,
            student_id: student_id,
            message: message
        })
    
    return { status: 202, message: "queued" }


# runs as a separate process, can have multiple instances
function email_worker():
    while true:
        job = email_queue.consume()
        try:
            send_email(job.student_id, job.message)
        except EmailError:
            if job.retries < 3:
                job.retries += 1
                delay = 2 ** job.retries  # exponential backoff: 2s, 4s, 8s
                email_queue.publish(job, delay=delay)
            else:
                dead_letter_queue.publish(job)
                log_error("email failed permanently for", job.student_id)


function push_worker():
    while true:
        job = push_queue.consume()
        try:
            push_to_app(job.student_id, job.message)
        except:
            # push failure is less critical, retry once
            if job.retries < 1:
                job.retries += 1
                push_queue.publish(job, delay=5)
```

**What improved:**
- notify_all now returns in ~1-2 seconds instead of 40+ minutes
- email failures retry automatically with backoff
- DB writes and emails are decoupled — one failing doesn't block the other
- failed jobs land in a dead-letter queue so nothing is silently lost
- can run multiple email worker instances to speed up delivery

---

# Stage 6

## Priority Inbox

The goal: show the top N most important unread notifications, where importance is based on type (placement > result > event) and recency (newer = higher priority).

**Scoring formula:**

```
priority = typeWeight * 1000 + recencyScore

typeWeight:   Placement=3, Result=2, Event=1
recencyScore: max(0, 1000 - ageInHours)
```

Multiplying type weight by 1000 ensures type always wins over recency — a placement notification from 3 days ago ranks higher than a result from today.

**Efficient top-N using a min-heap:**

Instead of sorting all notifications and taking the top N, I used a min-heap of size N. For each notification:
- if heap has fewer than N items → insert
- if current item's priority > heap minimum → replace min with current item

This keeps exactly the top N items at all times. Time complexity: O(n log N) vs O(n log n) for full sort. For large N this doesn't matter much, but it's the right approach if new notifications keep coming in (streaming scenario).

See `notification_app_be/index.js` for the implementation.

**Handling new notifications:**

As new notifications arrive, just call `heap.push(newNotif)` — the heap maintains the top N automatically. No need to re-sort the entire list.
