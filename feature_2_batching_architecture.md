# Feature 2.1: Server-Side Batching Architecture

## The Problem
When deploying a **500 MB** `.zip` file to **500 agents** simultaneously, the server needs to transmit **250 Gigabytes** of data instantly. 

If this happens simultaneously:
1. **Network Saturation:** Your server's 1 Gbps or 10 Gbps Network Interface Card (NIC) will maximize instantly.
2. **Switch Flooding:** The massive burst of traffic will flood the local factory network switches, causing packet drops and collisions.
3. **Agent Timeouts:** Because 500 agents are fighting for the same limited bandwidth, individual download speeds will drop to kilobytes per second. Many agents will trigger HTTP timeout errors before the 500 MB transfer finishes.

---

## 🏗 The Solution: "The Dispatch Queue"

Instead of blasting 500 SignalR commands the moment the operator clicks "Deploy", the server will act as a traffic controller using a Global Setting called `MaxConcurrentDownloads`.

### How It Works:
1. When a schedule is started, all 500 agents are inserted into the `UpdateDeployments` table with a status of `Queued`.
2. A background worker (`UpdateSchedulerService`) runs every **10 seconds**.
3. It checks the database: *"How many agents are currently in the `Dispatched` or `Downloading` states?"*
4. If the number of currently downloading agents is *less* than `MaxConcurrentDownloads`, it grabs the next batch of `Queued` agents to fill the available slots.
5. It changes their status to `Dispatched` and sends them the SignalR command.
6. When an agent finishes downloading and begins extraction, it moves its status to `Installing`. This instantly frees up a slot in the queue.
7. Within 10 seconds, the server dispatches the payload to the next `Queued` agent.

---

## 🧮 Bandwidth & Concurrency Math

To decide the ideal configuration for your factory, look at the math below based on a **500 MB** release folder.

### Scenario A: Server has a 1 Gbps Network Card (Standard Ethernet)
* **Maximum Theoretical Output:** 1,000 Megabits per second (Mbps)
* **Practical Output limit:** ~100 Megabytes per second (MB/s)

**Recommended Setting:** `MaxConcurrentDownloads = 10`

**The Math:**
- 10 agents download at exactly the same time.
- The server pushes a healthy 10 MB/s to each agent.
- Total bandwidth used: **100 MB/s** (This safely saturates the 1 Gbps server link without causing massive packet drops).
- **Time to download:** 500 MB ÷ 10 MB/s = **50 seconds**.
- Every 50 seconds, a batch of 10 machines finishes downloading and moves to `Installing`.
- 10 machines × 50 seconds × 50 batches = **~41 Minutes to deploy to the entire 500-machine factory.**

### Scenario B: Server has a 10 Gbps Network Card (Enterprise Fiber)
* **Maximum Theoretical Output:** 10,000 Megabits per second (Mbps)
* **Practical Output limit:** ~1,000 Megabytes per second (MB/s)
* *(Note: This assumes your factory switches and agent Wi-Fi/Ethernet cards can also handle high throughput).*

**Recommended Setting:** `MaxConcurrentDownloads = 50`

**The Math:**
- 50 agents download exactly at the same time.
- The server pushes 10 MB/s to each of the 50 agents.
- Total bandwidth used: **500 MB/s** (safely under the 1,000 MB/s limit of the server).
- **Time to download:** 500 MB ÷ 10 MB/s = **50 seconds**.
- Every 50 seconds, a massive batch of 50 machines finishes.
- 50 machines × 50 seconds × 10 batches = **~8.5 Minutes to deploy to the entire 500-machine factory.**

---

## ⚙️ Architecture Changes Required

To implement this into the current codebase, we only need a few backend changes (no frontend changes needed!).

1. **New Setting:** We will add `MaxConcurrentDownloads` to the `UpdateSettings` table (defaults to 10).
2. **UpdateSchedulerService:** We rewrite the `CheckAndDispatchSchedulesAsync` logic:
   - Instead of looking for `Status == "Pending"` schedules, it looks at `Status == "Queued"` deployments.
   - It performs the math: `AvailableSlots = MaxConcurrent - Count(Downloading + Dispatched)`.
   - Take the top `X` queued deployments (ordered by Schedule ID or Line Number) and dispatch exactly `X` SignalR messages.
3. **Agent Flow:** Agents already transition from `Dispatched` → `Downloading` → `Installing`. Because `Installing` is no longer a "network-heavy" state, the slot is freed immediately exactly when needed.

## Conclusion
This architecture requires zero new physical infrastructure. It guarantees your factory network will never crash during an update. Even with a large 500 MB file and a basic 1 Gbps network card, you can safely deploy to 500 machines completely automatically in roughly **40 minutes** while the rest of the factory's network traffic operates entirely uninterrupted.
