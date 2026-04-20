# Message Broker Architecture & Workflows

This document outlines the asynchronous and synchronous event-driven communication flows currently established in the platform using RabbitMQ. By transitioning to a Message Broker, we have decoupled services, improved fault tolerance, and shifted heavy processing (like AI grading) to the background.

## 1. The Asynchronous Task Queue Pattern (AI Grading)
When a learner finishes a Writing or Speaking task, the system doesn't make them wait minutes for the AI to return a score. Instead, it offloads the work to a background queue.

```mermaid
sequenceDiagram
    participant Frontend as Frontend (Next.js)
    participant Sub as Submission Service
    participant RMQ as RabbitMQ (Queue)
    participant Worker as Grading Worker (Consumer)
    participant AI as LLM / AI API
    
    Frontend->>Sub: POST /writing-submissions
    Note over Sub: Creates submission in DB<br/>Status: "pending"
    Sub->>RMQ: Publish message (GRADE_WRITING)
    Sub-->>Frontend: 201 Created (Return immediately)
    Note over Frontend: UI shows "Grading in Progress..."
    
    RMQ->>Worker: Consume message
    Note over Worker: Background task starts
    Worker->>AI: Fetch AI evaluation (Heavy task)
    AI-->>Worker: Return JSON grading
    Note over Worker: Update DB status <br/>to "ai_graded"
    Worker->>RMQ: Acknowledge (Ack) message
```
**Benefits:**
* The UI never hangs or times out.
* If the AI service is down, the message stays in the queue and will be processed once the connection restores.

---

## 2. The Remote Procedure Call (RPC) Pattern (Decoupling Monolith)
Before this migration, the Submission Service directly queried tables owned by the Test Service. Now, it queries the Test Service over the Message Broker using an RPC (Request-Reply) pattern.

```mermaid
sequenceDiagram
    participant Frontend as Frontend (Next.js)
    participant Sub as Submission Service
    participant RMQ as RabbitMQ
    participant Test as Test Service
    
    Frontend->>Sub: POST /attempts/:id/submit
    Note over Sub: Needs correct answers<br/>to grade MCQs
    
    Sub->>RMQ: Send request (`TEST.GET_ANSWERS`)
    RMQ->>Test: Deliver request payload (question IDs)
    Note over Test: Safely queries its own DB
    Test-->>RMQ: Return answer payloads
    RMQ-->>Sub: Receive answers asynchronously
    
    Note over Sub: Grades attempt natively
    Sub-->>Frontend: 200 OK (Attempt Graded)
```
**Benefits:**
* Eliminates the "Distributed Monolith" anti-pattern. Services no longer cross database limits boundary-lines without permission.
* If the `test-service` crashes, the payload isn't permanently dropped; the submission-service elegantly waits.

---

## 3. The Pub/Sub Event Pattern (Analytics Updates)
When a test is scored, multiple things need to update globally. The Submission service simply drops an event, and any interested service (like Analytics) picks it up.

```mermaid
sequenceDiagram
    participant Sub as Submission Service
    participant RMQ as RabbitMQ (Exchange)
    participant Analytics as Analytics Service
    participant Email as Email / Notification Service (Future)
    
    Note over Sub: Test Attempt graded
    Sub->>RMQ: Emit Event (`ANALYTICS.TEST_SUBMITTED`)
    
    par Parallel Consumers
        RMQ-->>Analytics: Reads Event payload
        Note over Analytics: Trigger `fullSyncLearnerAnalytics`<br/>Updates global band profiles
        
        RMQ-->>Email: Reads Event payload (Future Idea)
        Note over Email: Send "Congrats on finishing!" email
    end
```
**Benefits:**
* The Submission Service finishes its operation instantly and doesn't care if Analytics is slow, broken, or down.
* New services can be added easily. If a new "Gamification Service" needs to give the user XP points for finishing a test, it just hooks into `ANALYTICS.TEST_SUBMITTED` without requiring a single code change in the `submission-service`.
