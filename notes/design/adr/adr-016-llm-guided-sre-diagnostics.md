# ADR-016: LLM-Guided SRE Diagnostics Interface with Sliding Autonomy

## Status
**Proposed** - 2025-01-19

## Context

The ClickHouse blog post "The LLM Observability Challenge" (https://clickhouse.com/blog/llm-observability-challenge) highlights critical limitations of LLMs in production incident resolution:

1. **LLMs get locked onto single lines of reasoning** - Missing critical details and alternative hypotheses
2. **Generate convincing but incorrect explanations** - Plausible-sounding analysis that leads to wrong conclusions
3. **Computational inefficiency** - Token-intensive investigations that are expensive and slow
4. **Lack systematic investigation** - Models struggle with comprehensive data exploration
5. **Cannot replace human SREs** - LLMs can assist but cannot fully automate root cause analysis

Traditional observability tools present data but don't guide the diagnostic process. SREs must manually:
- Navigate complex multi-service architectures
- Correlate data across traces, logs, and metrics
- Distinguish signal from noise
- Understand context and service interdependencies
- Follow systematic investigation patterns

## Decision

We will implement an **LLM-Guided SRE Diagnostics Interface** with a **sliding autonomy model** that allows operators to dynamically adjust the level of automation from fully manual to fully autonomous investigation. The system uses a **hypothesis-driven investigation stack** with configurable validation gates.

### Core Innovation: Sliding Autonomy Model

```typescript
interface AutonomySettings {
  level: number // 0-100 slider value

  // Derived behaviors based on level
  autoStackManagement: boolean      // Level > 20
  autoHypothesisGeneration: boolean // Level > 40
  autoQueryExecution: boolean       // Level > 60
  autoEvidenceInterpretation: boolean // Level > 70
  autoSubInvestigation: boolean     // Level > 80
  autoConclusion: boolean           // Level === 100

  // Validation gates (always require human approval)
  requireValidationFor: {
    stackPush: boolean    // Add new hypothesis to stack
    stackPop: boolean     // Remove/complete hypothesis
    conclusion: boolean   // Final root cause determination
    remediation: boolean  // Suggested fixes
  }
}

// Autonomy Levels
const AUTONOMY_PRESETS = {
  MANUAL: 0,           // Step-by-step, full human control
  GUIDED: 25,          // Suggestions only
  ASSISTED: 50,        // Auto-generate, human executes
  SEMI_AUTO: 75,       // Auto-investigate sub-hypotheses
  PLAN_MODE: 85,       // Full investigation plan, human approves
  AUTONOMOUS: 100      // Fully autonomous (with safety gates)
}
```

### Investigation Stack Model with Sliding Autonomy

```typescript
interface Investigation {
  id: string
  name: string
  startedAt: Date
  autonomyLevel: number
  stack: HypothesisFrame[]
  evidence: Evidence[]
  validationGates: ValidationGate[]
  conclusion?: Conclusion
}

interface HypothesisFrame {
  id: string
  hypothesis: string
  status: 'investigating' | 'proven' | 'disproven' | 'inconclusive' | 'awaiting_validation'
  evidence: Evidence[]
  subHypotheses: HypothesisFrame[]
  generatedQueries: SQLQuery[]
  visualizations: Visualization[]
  userFeedback: Feedback[]

  // Autonomy controls
  investigationMode: 'manual' | 'assisted' | 'autonomous'
  autoInvestigateDepth: number // How many sub-levels to auto-investigate
  validationRequired: boolean  // Does this need human validation?
}

interface ValidationGate {
  id: string
  type: 'hypothesis_complete' | 'stack_modification' | 'conclusion' | 'remediation'
  status: 'pending' | 'approved' | 'rejected'
  hypothesis: HypothesisFrame
  proposedAction: Action
  reasoning: string
  evidence: Evidence[]
  timestamp: Date
}
```

### Sliding Autonomy Behaviors

#### Level 0-25: Manual Investigation (Step-by-Step)
```typescript
// User drives every step
{
  level: 0,
  behavior: {
    user: "I think the database might be slow",
    system: "Would you like me to help you investigate database performance?",
    actions: [
      "Suggest queries to run",
      "Wait for user to select",
      "User executes query",
      "Display results",
      "Wait for interpretation"
    ]
  }
}
```

#### Level 25-50: Guided Investigation (Assisted)
```typescript
// System suggests, user approves each step
{
  level: 35,
  behavior: {
    user: "Database seems slow",
    system: "I'll help investigate. Here are 3 hypotheses:",
    hypotheses: [
      "1. Query performance degradation",
      "2. Lock contention",
      "3. Resource saturation"
    ],
    actions: [
      "Auto-generate investigation queries",
      "User reviews and approves queries",
      "System executes approved queries",
      "System provides interpretation",
      "User validates interpretation"
    ]
  }
}
```

#### Level 50-75: Semi-Autonomous Investigation
```typescript
// System investigates sub-hypotheses autonomously
{
  level: 65,
  behavior: {
    user: "Investigate high API latency",
    system: "Starting investigation with auto-exploration enabled",
    actions: [
      "Generate hypothesis tree",
      "Auto-investigate leaf hypotheses",
      "Collect evidence automatically",
      "Present findings for validation",
      "User approves before moving to next branch"
    ],
    validation_points: [
      "Hypothesis completion",
      "Major stack modifications",
      "Conclusion proposals"
    ]
  }
}
```

#### Level 75-90: Plan Mode Investigation
```typescript
// System creates full plan, executes with checkpoints
{
  level: 85,
  behavior: {
    user: "System is experiencing errors",
    system: "Creating comprehensive investigation plan...",
    plan: {
      mainHypothesis: "Service degradation detected",
      investigationSteps: [
        "1. Check golden signals across all services",
        "2. Identify anomalous services",
        "3. Deep-dive on top 3 suspects",
        "4. Correlate with recent changes",
        "5. Validate root cause"
      ],
      estimatedTime: "5-10 minutes",
      validationCheckpoints: 3
    },
    actions: [
      "Present full plan for approval",
      "Execute plan with progress updates",
      "Pause at validation checkpoints",
      "Continue on approval"
    ]
  }
}
```

#### Level 100: Fully Autonomous Investigation
```typescript
// System investigates completely autonomously
{
  level: 100,
  behavior: {
    trigger: "Alert: High error rate detected",
    system: "Autonomous investigation initiated",
    actions: [
      "Build complete hypothesis tree",
      "Systematically investigate all branches",
      "Prune disproven hypotheses",
      "Collect comprehensive evidence",
      "Reach conclusion",
      "Present full report with remediation"
    ],
    safety_gates: [
      "Final conclusion requires validation",
      "Remediation actions require approval",
      "Cost limits on resource usage"
    ]
  }
}
```

### UI/UX Design for Sliding Autonomy

```typescript
interface DiagnosticsUI {
  // Autonomy slider component
  autonomyControl: {
    type: 'slider'
    min: 0
    max: 100
    current: number
    presets: AutonomyPreset[]
    labels: {
      0: "Manual",
      25: "Guided",
      50: "Assisted",
      75: "Semi-Auto",
      85: "Plan Mode",
      100: "Autonomous"
    }
  }

  // Real-time autonomy indicator
  currentMode: {
    level: number
    description: string
    activeFeatures: string[]
    nextValidationPoint?: ValidationGate
  }

  // Investigation control panel
  controls: {
    pause: () => void
    resume: () => void
    adjustAutonomy: (level: number) => void
    overrideDecision: (decision: Decision) => void
    requestExplanation: (hypothesis: Hypothesis) => void
  }
}
```

### Visual Representation

```
┌──────────────────────────────────────────────────────────┐
│ Investigation: High API Latency                          │
├──────────────────────────────────────────────────────────┤
│ Autonomy Level: [====|==============] 65% (Semi-Auto)    │
│                                                          │
│ ⚙️ Active: Auto-investigate sub-hypotheses               │
│ ⏸️ Paused at: Validation checkpoint                      │
├──────────────────────────────────────────────────────────┤
│ Investigation Stack:                                     │
│                                                          │
│ [✓] Initial: API latency > 1s                           │
│  ├─[✓] DB queries slow (auto-investigated)             │
│  │  ├─[✓] No lock contention found                     │
│  │  └─[✓] Query plans normal                           │
│  └─[🔄] Network latency (investigating...)              │
│     ├─[⏳] Cross-AZ traffic analysis                    │
│     └─[⏳] Packet loss detection                        │
│                                                          │
│ 📌 Validation Required:                                  │
│ "Network latency confirmed as primary cause"             │
│ [Approve] [Reject] [Request Details]                     │
└──────────────────────────────────────────────────────────┘
```

### Implementation Strategy for Sliding Autonomy

#### Core Components

```typescript
class AutonomyManager {
  private currentLevel: number = 50 // Default to assisted

  // Determine action based on autonomy level
  shouldAutoExecute(action: ActionType): boolean {
    const thresholds = {
      'generate_hypothesis': 40,
      'execute_query': 60,
      'interpret_results': 70,
      'push_to_stack': 20,
      'pop_from_stack': 30,
      'investigate_sub': 80,
      'conclude': 100
    }
    return this.currentLevel >= thresholds[action]
  }

  // Get validation requirements for current level
  getValidationGates(): ValidationRequirement[] {
    if (this.currentLevel === 100) {
      return ['conclusion', 'remediation'] // Minimal gates
    } else if (this.currentLevel >= 75) {
      return ['hypothesis_complete', 'conclusion', 'remediation']
    } else if (this.currentLevel >= 50) {
      return ['stack_modification', 'hypothesis_complete', 'conclusion', 'remediation']
    } else {
      return ['all_actions'] // Maximum validation
    }
  }

  // Adjust autonomy mid-investigation
  adjustAutonomy(newLevel: number): void {
    this.currentLevel = newLevel
    this.reconfigureActiveInvestigations()
  }
}
```

#### Hybrid Investigation Flow

```typescript
class HybridInvestigator {
  async investigate(
    problem: Problem,
    autonomyLevel: number
  ): Effect.Effect<Investigation> {
    const manager = new AutonomyManager(autonomyLevel)

    // Generate initial hypotheses
    const hypotheses = await this.generateHypotheses(problem)

    // Based on autonomy, either show for selection or auto-select
    const selected = manager.shouldAutoExecute('generate_hypothesis')
      ? this.autoSelectHypotheses(hypotheses)
      : await this.getUserSelection(hypotheses)

    // Push to stack with appropriate mode
    for (const hypothesis of selected) {
      if (manager.shouldAutoExecute('push_to_stack')) {
        await this.stack.push(hypothesis)
      } else {
        await this.requestUserApproval('push_to_stack', hypothesis)
      }

      // Determine investigation depth
      if (autonomyLevel >= 80) {
        // Auto-investigate sub-hypotheses
        await this.autoInvestigateTree(hypothesis, maxDepth: 3)
      } else if (autonomyLevel >= 50) {
        // Auto-investigate immediate children only
        await this.autoInvestigateTree(hypothesis, maxDepth: 1)
      } else {
        // Manual investigation
        await this.guideManualInvestigation(hypothesis)
      }
    }

    return this.compileInvestigation()
  }
}
```

### Benefits of Sliding Autonomy

1. **Flexibility**: Adapts to user expertise and situation urgency
2. **Learning Tool**: Beginners can start manual, increase autonomy as they learn
3. **Trust Building**: Users can gradually increase autonomy as trust builds
4. **Efficiency**: Experienced users can delegate routine investigations
5. **Safety**: Critical decisions always have validation gates
6. **Debugging**: Can drop to manual mode to debug complex issues

### Addressing ClickHouse Challenges with Sliding Autonomy

1. **Single-Line Reasoning**: Lower autonomy forces broader exploration
2. **Incorrect Explanations**: Validation gates catch errors before acceptance
3. **Computational Efficiency**: Higher autonomy for routine investigations saves tokens
4. **Systematic Investigation**: Autonomy levels enforce appropriate depth
5. **Human Expertise**: Sliding scale keeps humans in control at comfort level

## Consequences

### Positive
- **Adaptive System**: Adjusts to user needs and expertise dynamically
- **Gradual Automation**: Organizations can adopt at their own pace
- **Learning Curve**: Smooth transition from manual to automated
- **Trust Through Transparency**: Users see exactly what system is doing
- **Efficiency Gains**: Routine investigations can be highly automated
- **Safety Preserved**: Critical decisions always have human oversight

### Negative
- **Complexity**: Sliding autonomy adds state management complexity
- **Testing Burden**: Many autonomy levels to test and validate
- **User Confusion**: Too many options might overwhelm new users
- **Inconsistency Risk**: Different autonomy levels may yield different results

## Implementation Priorities

1. **Phase 1**: Core stack with manual mode (Level 0-25)
2. **Phase 2**: Add assisted mode (Level 25-50)
3. **Phase 3**: Semi-autonomous capabilities (Level 50-75)
4. **Phase 4**: Plan mode and full autonomy (Level 75-100)

## Decision Outcome

**Approved for implementation** with sliding autonomy as the core differentiator. The system will default to 50% autonomy (assisted mode) and allow users to adjust based on their comfort and the investigation complexity. Success will be measured by user adoption at different autonomy levels and reduction in MTTR.