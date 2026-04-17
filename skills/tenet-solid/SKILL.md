---
name: tenet-solid
description: "Evaluates adherence to SOLID design principles: Single Responsibility (classes doing multiple things), Open/Closed (switch/if-else on type), Liskov Substitution (contract-breaking overrides), Interface Segregation (fat interfaces), and Dependency Inversion (concrete infrastructure in domain logic)."
when_to_use: "SOLID audit, design principles, SRP, OCP, LSP, ISP, DIP, architecture review, tenet solid"
model: opus
allowed-tools: Bash Read Grep Glob Write
---

# Tenet SOLID — Design Principles Audit

> Evaluates adherence to the five SOLID design principles across the codebase. Identifies god classes, type-switching anti-patterns, contract violations, fat interfaces, and misplaced concrete dependencies.

## Purpose

This skill assesses whether the codebase follows the SOLID design principles — five guidelines that, when followed, produce code that is easier to extend, test, and maintain:

1. **S — Single Responsibility Principle (SRP):** A class should have one reason to change
2. **O — Open/Closed Principle (OCP):** Software entities should be open for extension but closed for modification
3. **L — Liskov Substitution Principle (LSP):** Subtypes must be substitutable for their base types without breaking correctness
4. **I — Interface Segregation Principle (ISP):** No client should be forced to depend on methods it does not use
5. **D — Dependency Inversion Principle (DIP):** High-level modules should depend on abstractions, not concrete implementations

SOLID violations make code rigid, fragile, and resistant to change. They are leading indicators of future bugs when requirements evolve.

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python, java]
  heuristic: [go, rust, kotlin, swift, ruby, php, c#, all others]
  note: >
    Native support uses AST-level understanding of class definitions,
    inheritance, interfaces/protocols, and import graphs. Heuristic
    support uses pattern matching on keywords, naming conventions,
    and file structure.
```

## Toolchain Inputs

This skill does NOT consume toolchain output. All analysis is judgment-based, performed by reading source code and reasoning about design structure.

The only toolchain file consumed is:
- `.healthcheck/toolchain/language-census.json` — to determine which languages are present and route analysis accordingly

## Rubric

### SRP — Single Responsibility Principle

| Condition | Severity | Rationale |
|---|---|---|
| Class has 3-4 distinct responsibility groups | minor | Cohesion is weakening; consider splitting on next change |
| Class has 5-6 distinct responsibility groups | major | God class emerging; actively harms maintainability |
| Class has 7+ distinct responsibility groups | critical | God class; virtually untestable in isolation |
| File mixes domain logic with infrastructure concerns | minor | Separation of concerns violation |
| Single function/method handles 3+ unrelated tasks | minor | Function-level SRP violation |

**Responsibility detection method:**

Group methods by semantic clusters based on naming patterns and behavior:

| Cluster Name | Method Patterns |
|---|---|
| Data access | `fetch*`, `load*`, `read*`, `query*`, `find*`, `get*FromDb`, `save*`, `persist*`, `insert*`, `update*`, `delete*`, `remove*` |
| Presentation | `render*`, `display*`, `format*`, `toString`, `toHTML`, `toJSON`, `print*`, `draw*` |
| Validation | `validate*`, `check*`, `verify*`, `is*`, `has*`, `can*`, `assert*`, `ensure*` |
| HTTP/API | `handle*`, `route*`, `middleware*`, `respond*`, `request*`, `endpoint*` |
| Business logic | `process*`, `calculate*`, `compute*`, `apply*`, `execute*`, `run*`, `perform*` |
| Notification | `notify*`, `send*`, `email*`, `alert*`, `publish*`, `emit*`, `dispatch*` |
| Auth/Security | `authenticate*`, `authorize*`, `login*`, `logout*`, `encrypt*`, `decrypt*`, `hash*` |
| Caching | `cache*`, `invalidate*`, `evict*`, `memoize*`, `warm*` |
| Logging/Monitoring | `log*`, `trace*`, `metric*`, `track*`, `audit*`, `measure*` |
| Configuration | `configure*`, `setup*`, `init*`, `bootstrap*`, `register*` |

A class with methods spanning 3+ clusters is flagged as an SRP violation.

### OCP — Open/Closed Principle

| Condition | Severity | Rationale |
|---|---|---|
| Switch/if-else chain on type discriminator (3-4 cases) with behavior per case | minor | Should use polymorphism; adding a new type requires modifying this code |
| Switch/if-else chain on type discriminator (5-7 cases) | major | Modification magnet; every new type touches this function |
| Switch/if-else chain on type discriminator (8+ cases) | critical | Extreme OCP violation; refactor to strategy/visitor pattern |
| `instanceof`/`typeof` checks driving different behavior branches | minor | Type-checking anti-pattern; use polymorphism or pattern matching |

**Detection method:**
- Find `switch` statements and `if/else if` chains where the discriminant is a type field, enum, or `instanceof`/`typeof`/`is`/`as` check
- Count the number of cases/branches
- Exclude: exhaustive pattern matching in functional languages (Rust `match`, Haskell `case`), Redux reducers, serialization/deserialization code, factory functions (which are the OCP-compliant solution)

### LSP — Liskov Substitution Principle

| Condition | Severity | Rationale |
|---|---|---|
| Override that throws `NotImplementedError` / `UnsupportedOperationException` | major | Breaks substitutability — callers cannot rely on the base contract |
| Override that narrows parameter types (contravariance violation) | major | Subtype rejects inputs the base type accepts |
| Override that widens return types or changes error semantics | minor | Subtle contract breakage; may cause runtime surprises |
| Override that changes void to throwing or vice versa | minor | Side-effect contract violation |

**Detection method:**
- Find class inheritance relationships (`extends`, `implements`, `:`, `<`)
- For each override, check if the method body contains `throw new NotImplementedError`, `raise NotImplementedError`, `panic("not implemented")`, or similar
- Check if override signatures differ from base class signatures in ways that break substitutability

### ISP — Interface Segregation Principle

| Condition | Severity | Rationale |
|---|---|---|
| Interface/protocol with 8-11 methods | minor | Interface is getting large; clients may depend on methods they don't use |
| Interface/protocol with 12-15 methods | major | Fat interface; split into role-specific interfaces |
| Interface/protocol with 16+ methods | critical | Monolithic interface; severe coupling risk |
| Class implements interface but leaves methods as no-ops or throws | major | ISP violation evidenced by forced empty implementations |

**Detection method:**
- Find interface/protocol/abstract class definitions
- Count required methods (exclude default/provided implementations)
- Find implementations and check for no-op methods (`pass`, `return`, `{}`, `throw`)

### DIP — Dependency Inversion Principle

| Condition | Severity | Rationale |
|---|---|---|
| Domain/business module directly imports infrastructure concrete class | minor | Coupling domain logic to a specific implementation |
| Domain module instantiates infrastructure (`new PostgresClient()`, `new S3Client()`) | major | Hard dependency on infrastructure; untestable without the real service |
| Multiple domain files import the same concrete infrastructure class | critical | Systemic DIP violation; infrastructure change ripples across domain |

**Detection method:**
- Identify domain/business-logic modules (directories: `domain/`, `core/`, `models/`, `services/`, `usecases/`, `business/`, `entities/`)
- Identify infrastructure modules (directories: `infrastructure/`, `infra/`, `adapters/`, `db/`, `database/`, `repositories/`, `external/`, `clients/`)
- Check if domain modules directly import from infrastructure modules
- Look for `new` instantiation of infrastructure classes within domain code
- Common infrastructure classes: `*Client`, `*Repository` (concrete, not interface), `*Connection`, `*Pool`, `*Driver`, `*Adapter` (concrete)

### Info-Level Observations

The following do NOT affect the score but are reported as `info`:
- Classes with 2 responsibility clusters (approaching SRP threshold)
- Interfaces with 6-7 methods (approaching ISP threshold)
- Opportunities to introduce dependency injection
- Sealed/final classes that could benefit from an interface for testability

## Procedure

### Step 1: Read Language Census

```
Read .healthcheck/toolchain/language-census.json
```

Determine primary language, all languages present, and file counts.

### Step 2: Identify Architectural Boundaries

Scan the directory structure to identify domain vs. infrastructure vs. presentation layers:

```
# Look for conventional directory structures
Glob: **/domain/**  **/core/**  **/models/**  **/services/**  **/usecases/**
Glob: **/infrastructure/**  **/infra/**  **/adapters/**  **/db/**  **/repositories/**
Glob: **/presentation/**  **/views/**  **/controllers/**  **/routes/**  **/handlers/**
Glob: **/shared/**  **/common/**  **/utils/**  **/lib/**
```

If no conventional structure is detected, infer layers from file contents and import patterns.

### Step 3: Analyze Classes for SRP

For each class/module in the codebase:

1. List all public methods
2. Classify each method into a responsibility cluster (see table above)
3. Count distinct clusters
4. If 3+ clusters, emit a finding with severity per rubric

Also check for function-level SRP violations in non-OOP code: functions that mix I/O, computation, and side effects.

### Step 4: Analyze for OCP Violations

Search for switch statements and if/else chains:

```
# Patterns to search
switch (*.type)
switch (*.kind)
if (x instanceof ...)
if (typeof x === ...)
if (x.type === ...)
if isinstance(x, ...)
```

For each match:
1. Count the number of cases/branches
2. Check if each branch contains distinct behavior (not just returning a value — simple value mappings are acceptable)
3. If 3+ behavioral branches on a type discriminator, emit a finding

### Step 5: Analyze for LSP Violations

For each class inheritance relationship:

1. Identify overridden methods
2. Check for `NotImplementedError`, `UnsupportedOperationException`, `todo!()`, `panic("not implemented")`, `pass` with a comment indicating non-support
3. Check for signature mismatches between override and base
4. Emit findings per rubric

### Step 6: Analyze for ISP Violations

For each interface, protocol, or abstract class:

1. Count required methods
2. If count exceeds threshold, emit a finding
3. Also check implementations for no-op methods as evidence of ISP violation

### Step 7: Analyze for DIP Violations

Using the architectural boundaries from Step 2:

1. For each file in domain/business directories, read its imports
2. Flag imports of concrete infrastructure classes
3. Flag `new` instantiation of infrastructure classes
4. Count how many domain files share the same concrete dependency (for critical threshold)

### Step 8: Classify Findings

Each finding MUST include:
- `dimension`: `"solid"`
- `severity`: per rubric above
- `title`: e.g., "SRP: UserService has 6 distinct responsibilities"
- `description`: 2-4 sentences explaining the violation and its consequences
- `file`: repo-relative path
- `line`: line number of the class/interface/function definition
- `snippet`: relevant code excerpt (max 500 chars)
- `fix_prompt`: self-contained prompt following the template in `shared/fix_prompt_template.md`
- `confidence`: one of `native`, `heuristic`

### Step 9: Compute Score

Apply the standard scoring formula:

```
score = 100 - (5 × critical_count + 2 × major_count + 0.5 × minor_count)
score = max(0, min(100, int(score + 0.5)))  # Arithmetic rounding (not banker's rounding)
```

Info findings do NOT affect the score.

### Step 10: Compute Dimension Metrics

```json
{
  "total_classes_analyzed": 48,
  "total_interfaces_analyzed": 15,
  "srp_violations": 7,
  "ocp_violations": 3,
  "lsp_violations": 1,
  "isp_violations": 2,
  "dip_violations": 5,
  "god_classes": ["UserService", "AppController", "DataManager"],
  "fattest_interface": { "name": "IRepository", "method_count": 18, "file": "src/types.ts" },
  "avg_methods_per_class": 6.2,
  "max_methods_per_class": 34,
  "avg_interface_methods": 5.1,
  "max_interface_methods": 18,
  "domain_infra_imports": 12,
  "confidence_breakdown": {
    "native": 40,
    "heuristic": 8
  }
}
```

### Step 11: Write Report

Write the dimension report to `.healthcheck/reports/solid.json`:

```json
{
  "key": "solid",
  "score": 82,
  "weight": 1.1,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "Analyzed 48 classes and 15 interfaces. 3 god classes detected (UserService, AppController, DataManager). 5 DIP violations where domain modules directly instantiate infrastructure. Strongest area: LSP (only 1 violation).",
  "metrics": { ... },
  "findings": [ ... ]
}
```

## Output

- `.healthcheck/reports/solid.json` — the dimension report with all findings, score, and metrics

## Constraints

- **Judgment-based, not toolchain-based:** This skill reads source code and reasons about design. There are no deterministic tools for SOLID analysis. All findings have confidence `native` or `heuristic`.
- **No false positives on acceptable patterns:** Do NOT flag the following as OCP violations:
  - Redux reducers (switch on action.type is idiomatic)
  - Serialization/deserialization switch statements
  - Factory functions/methods (these ARE the OCP-compliant pattern)
  - Exhaustive pattern matching in Rust, Scala, Haskell, F#
  - Simple value-mapping switches (e.g., enum to string label)
- **No false positives on DIP in small projects:** If the project has fewer than 10 source files or no clear layered architecture, skip DIP analysis and note it in `notes`.
- **Respect .gitignore:** Only analyze files tracked by git (`git ls-files`).
- **Exclude generated code:** Skip `*.generated.*`, `*.min.js`, `dist/`, `build/`, `vendor/`, `node_modules/`.
- **Exclude test files from SRP analysis:** Test helper classes with many methods are not SRP violations.
- **Max findings cap:** Emit at most 50 findings. Keep all critical, then major, then minor, then info. Add an info finding noting omitted count.
- **Scoring math is pure:** The score formula is arithmetic only — no LLM judgment in the number.
- **Be conservative:** When uncertain whether a pattern is a violation, prefer `info` over `minor` or omit entirely. SOLID is contextual — a class with 3 responsibility clusters may be perfectly fine if it is a facade or orchestrator by design.
- **No positive findings:** Do NOT emit findings for well-implemented patterns ("this class correctly uses the strategy pattern"). Positive observations belong in the `dimension.notes` field. The findings array is exclusively for things that need attention or conscious decisions. Every finding — including `info` — must describe something the developer could change.

## fix_prompt Examples

### Example 1: God Class with Too Many Responsibilities (SRP)

```
# Fix: Split UserService into focused services (SRP violation)

## Context
The class `UserService` in `src/services/user-service.ts` has 34 methods spanning 6 distinct responsibility clusters: data access (findUser, saveUser, deleteUser), authentication (login, logout, refreshToken), email notifications (sendWelcome, sendPasswordReset, sendVerification), validation (validateEmail, validatePassword, checkDuplicate), profile management (updateProfile, uploadAvatar, changePassword), and analytics tracking (trackLogin, trackSignup, trackPageView).

## Location
- File: src/services/user-service.ts
- Line: 12
- Dimension: solid / major

## Current behavior
```typescript
export class UserService {
  constructor(
    private db: Database,
    private mailer: Mailer,
    private analytics: AnalyticsClient,
    private storage: FileStorage
  ) {}

  // Data access (8 methods)
  async findUser(id: string) { ... }
  async saveUser(user: User) { ... }
  // ... 6 more

  // Authentication (5 methods)
  async login(email: string, password: string) { ... }
  // ... 4 more

  // Email (6 methods)
  async sendWelcomeEmail(user: User) { ... }
  // ... 5 more

  // Validation (5 methods)
  validateEmail(email: string) { ... }
  // ... 4 more

  // Profile (5 methods)
  async updateProfile(id: string, data: Partial<Profile>) { ... }
  // ... 4 more

  // Analytics (5 methods)
  trackLogin(userId: string) { ... }
  // ... 4 more
}
```

## Required change
1. Create `src/services/user-repository.ts` — move all data access methods (`findUser`, `saveUser`, `deleteUser`, etc.)
2. Create `src/services/auth-service.ts` — move authentication methods (`login`, `logout`, `refreshToken`, etc.), inject `UserRepository`
3. Create `src/services/user-notification-service.ts` — move email methods, inject `Mailer`
4. Create `src/services/user-validation.ts` — move validation methods (these can be pure functions, no class needed)
5. Create `src/services/profile-service.ts` — move profile methods, inject `UserRepository` and `FileStorage`
6. Create `src/services/user-analytics.ts` — move analytics methods, inject `AnalyticsClient`
7. Update all call sites. If a gradual migration is needed, keep `UserService` as a thin facade that delegates to the new services.

## Constraints
- Do not change the behavior of any individual method
- All existing tests must pass — update imports but not assertions
- If other files depend on `UserService`, introduce the facade pattern for backward compatibility
- Each new service should have a single constructor dependency where possible

## Verification
- Run: `npm test` to confirm all tests pass
- Run: `grep -rn "class.*Service" src/services/` and confirm no service has more than 10 methods
- Run: `npx tsc --noEmit` to confirm no type errors
```

### Example 2: Type-Switching Violating OCP

```
# Fix: Replace type-switch in calculateShipping() with strategy pattern (OCP violation)

## Context
The function `calculateShipping` in `src/shipping/calculator.ts` uses a 7-case switch statement on `order.shippingMethod` to compute shipping costs. Every time a new shipping method is added, this function must be modified — violating the Open/Closed Principle.

## Location
- File: src/shipping/calculator.ts
- Line: 15
- Dimension: solid / major

## Current behavior
```typescript
function calculateShipping(order: Order): number {
  switch (order.shippingMethod) {
    case 'standard':
      return order.weight * 0.5 + 2.99;
    case 'express':
      return order.weight * 1.2 + 9.99;
    case 'overnight':
      return order.weight * 2.0 + 19.99;
    case 'freight':
      return calculateFreightRate(order);
    case 'pickup':
      return 0;
    case 'drone':
      return order.distance * 0.1 + 14.99;
    case 'international':
      return calculateInternationalRate(order);
    default:
      throw new Error(`Unknown method: ${order.shippingMethod}`);
  }
}
```

## Required change
1. Define a `ShippingStrategy` interface:
   ```typescript
   interface ShippingStrategy {
     calculate(order: Order): number;
   }
   ```
2. Create one implementation per shipping method in `src/shipping/strategies/`:
   - `standard-shipping.ts`, `express-shipping.ts`, `overnight-shipping.ts`, etc.
3. Create a strategy registry: `src/shipping/strategy-registry.ts`
   ```typescript
   const strategies: Record<string, ShippingStrategy> = {};
   export function registerStrategy(method: string, strategy: ShippingStrategy) { ... }
   export function getStrategy(method: string): ShippingStrategy { ... }
   ```
4. Register all strategies at application startup
5. Rewrite `calculateShipping`:
   ```typescript
   function calculateShipping(order: Order): number {
     return getStrategy(order.shippingMethod).calculate(order);
   }
   ```
6. Now adding a new shipping method requires only: create a new strategy class + register it. No existing code changes.

## Constraints
- Preserve the public API: `calculateShipping(order: Order): number` must not change signature
- All existing tests must pass without modification
- The `default` error case should become the registry's "not found" error
- Keep individual strategy files small (under 30 lines each)

## Verification
- Run: `npm test -- --testPathPattern=shipping`
- Run: `grep -rn "switch.*shippingMethod" src/` — should return zero matches
- Confirm each strategy file exists and implements the interface: `ls src/shipping/strategies/`
```

### Example 3: Concrete Infrastructure Dependency in Domain Logic (DIP)

```
# Fix: Inject abstract repository into OrderProcessor (DIP violation)

## Context
The class `OrderProcessor` in `src/domain/order-processor.ts` directly imports and instantiates `PostgresOrderRepository` from the infrastructure layer. This couples the domain logic to PostgreSQL — making it impossible to unit test without a database and impossible to switch databases without modifying domain code.

## Location
- File: src/domain/order-processor.ts
- Line: 3
- Dimension: solid / major

## Current behavior
```typescript
import { PostgresOrderRepository } from '../infrastructure/postgres-order-repository';
import { RedisCache } from '../infrastructure/redis-cache';

export class OrderProcessor {
  private repo = new PostgresOrderRepository();
  private cache = new RedisCache('orders');

  async process(orderId: string): Promise<void> {
    const order = await this.repo.findById(orderId);
    const cached = await this.cache.get(orderId);
    // ... domain logic using concrete infrastructure
  }
}
```

## Required change
1. Define an `OrderRepository` interface in the domain layer:
   ```typescript
   // src/domain/ports/order-repository.ts
   export interface OrderRepository {
     findById(id: string): Promise<Order | null>;
     save(order: Order): Promise<void>;
     delete(id: string): Promise<void>;
   }
   ```
2. Define a `CachePort` interface in the domain layer:
   ```typescript
   // src/domain/ports/cache-port.ts
   export interface CachePort {
     get<T>(key: string): Promise<T | null>;
     set<T>(key: string, value: T, ttl?: number): Promise<void>;
     invalidate(key: string): Promise<void>;
   }
   ```
3. Make `PostgresOrderRepository` implement `OrderRepository`
4. Make `RedisCache` implement `CachePort`
5. Refactor `OrderProcessor` to accept abstractions via constructor injection:
   ```typescript
   export class OrderProcessor {
     constructor(
       private repo: OrderRepository,
       private cache: CachePort
     ) {}
   }
   ```
6. Wire the concrete implementations at the composition root (e.g., `src/main.ts` or DI container)

## Constraints
- Domain layer (`src/domain/`) must have ZERO imports from `src/infrastructure/`
- The interfaces must live in `src/domain/ports/` (domain owns the abstractions)
- All existing tests must pass — update test files to inject mock/stub implementations
- Do not introduce a DI framework unless one is already in use

## Verification
- Run: `grep -rn "from.*infrastructure" src/domain/` — should return zero matches
- Run: `npm test` to confirm all tests pass
- Run: `npx tsc --noEmit` to confirm no type errors
- Inspect `src/domain/order-processor.ts` imports — should only reference domain types and ports
```

## Confidence Tiers

| Tier | Source | When Used |
|---|---|---|
| `native` | Skill's own analysis of TS/JS/Python/Java class structures, imports, and inheritance | Primary language is natively supported |
| `heuristic` | Pattern matching on keywords, naming conventions, file structure | Language without first-class class/interface parsing support |

Note: This skill never produces `deterministic` findings — SOLID analysis is inherently judgment-based. The `tree_sitter` tier is not used since the analysis requires semantic understanding beyond AST structure.

## Exceptions and Acceptable Patterns

The following are NOT violations and must NOT be flagged:

| Pattern | Why It Is Acceptable |
|---|---|
| Redux reducers with switch on `action.type` | Idiomatic Redux; adding actions does not modify the reducer's contract |
| Factory functions/classes | Factories ARE the OCP-compliant creation pattern |
| Serialization codec switches (JSON, XML, Protobuf) | These are typically exhaustive and stable |
| Rust `match` / Scala `match` / Haskell `case` | Exhaustive pattern matching enforced by compiler |
| Facade/Orchestrator classes | Intentionally coordinate multiple responsibilities by delegating |
| Controller classes in MVC | Route handlers naturally touch multiple services; they are composition roots |
| Simple enum-to-string mapping switches | Pure data mapping, no behavioral branching |
| Abstract base classes providing shared implementation | Template Method pattern is not an ISP violation |
