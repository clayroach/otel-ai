# Feature: Model Fine-Tuning Pipeline

## Status: Design Phase 🔄

**Feature ID**: FEAT-012
**Status**: Design Phase
**Created**: 2025-01-23
**Author**: Claude Code with Human Architect
**Priority**: Medium
**Target Release**: Offline Training Infrastructure
**Last Updated**: 2025-01-23
**Related Features**: [FEAT-005 Diagnostics UI Fine-Tuning](./feature-005-diagnostics-ui-fine-tuning.md)

## Overview

### Purpose

Create a comprehensive offline model fine-tuning pipeline that collects diagnostic session data, enables human annotation, and trains custom models optimized for specific observability patterns. This feature operates independently from the main application, allowing for flexible experimentation and validation before deploying improved models back into production.

### Key Differentiators

- **Fully Offline Pipeline**: Operates independently from main application runtime
- **Multi-Tool Integration**: Combines Label Studio, LLaMA-Factory, and custom training scripts
- **Format Agnostic**: Supports multiple training formats (JSONL, HuggingFace, CSV)
- **A/B Testing Ready**: Built-in model validation and comparison framework
- **Production Decoupled**: Can run on separate infrastructure with GPU resources

### Architecture Philosophy

This feature is designed as a **standalone training infrastructure** that:
1. Collects data from production diagnostic sessions
2. Enables human expert annotation and correction
3. Trains models using various backends
4. Validates model improvements offline
5. Exports deployable models for production use

## Training Data Collection

### Data Sources

#### 1. Diagnostic Session Exports
Extract data from Feature 005 diagnostic sessions:
- Feature flag activations and their impacts
- AI-generated root cause analyses
- Human corrections and validations
- Performance metrics (time to resolution, accuracy)

#### 2. Production Telemetry Patterns
Real-world observability data:
- Common error patterns and their resolutions
- Performance bottleneck signatures
- Service dependency mappings
- Incident response histories

#### 3. Manual Annotations
Expert-labeled datasets:
- Root cause validations
- Query quality ratings
- Critical path accuracy assessments
- False positive/negative classifications

### Data Schema

```python
# Training data structure (Python for flexibility)
@dataclass
class TrainingExample:
    id: str
    timestamp: datetime

    # Input context
    telemetry_context: Dict[str, Any]  # Traces, metrics, logs
    service_topology: Dict[str, List[str]]  # Service dependencies
    time_range: Tuple[datetime, datetime]

    # Problem description
    symptoms: List[str]  # Observable issues
    affected_services: List[str]
    error_signatures: List[str]

    # Expected outputs
    root_cause: str
    diagnostic_query: str
    critical_paths: List[List[str]]
    remediation_steps: List[str]

    # Validation data
    human_validated: bool
    confidence_score: float
    corrections: Optional[Dict[str, str]]
    expert_notes: Optional[str]

    # Performance metrics
    time_to_identification: float  # seconds
    human_prompts_required: int
    false_hypotheses: List[str]

@dataclass
class TrainingDataset:
    examples: List[TrainingExample]
    metadata: Dict[str, Any]
    version: str
    created_at: datetime

    def to_jsonl(self) -> str:
        """Export to JSONL format for OpenAI fine-tuning"""
        pass

    def to_huggingface(self) -> Dataset:
        """Export to HuggingFace Dataset format"""
        pass

    def to_llama_factory(self) -> Dict:
        """Export to LLaMA-Factory format"""
        pass
```

## Label Studio Integration

### Deployment

```yaml
# docker-compose.fine-tuning.yml
version: '3.8'

services:
  label-studio:
    image: heartexlabs/label-studio:latest
    container_name: otel-ai-label-studio
    ports:
      - "8200:8080"
    volumes:
      - ./data/label-studio:/label-studio/data
      - ./configs/label-studio:/label-studio/config
      - ./exports:/exports
    environment:
      - LABEL_STUDIO_LOCAL_FILES_SERVING_ENABLED=true
      - LABEL_STUDIO_LOCAL_FILES_DOCUMENT_ROOT=/label-studio/data
      - DJANGO_DB=default
      - POSTGRE_NAME=label_studio
      - POSTGRE_USER=postgres
      - POSTGRE_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRE_HOST=postgres
      - POSTGRE_PORT=5432
    depends_on:
      - postgres
    networks:
      - training-network

  postgres:
    image: postgres:15
    container_name: otel-ai-postgres
    environment:
      - POSTGRES_DB=label_studio
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - training-network

volumes:
  postgres-data:

networks:
  training-network:
    driver: bridge
```

### Annotation Templates

```xml
<!-- Root Cause Validation Template -->
<View>
  <Header value="Diagnostic Context"/>
  <Text name="telemetry_summary" value="$telemetry_summary"/>
  <Text name="service_topology" value="$service_topology"/>
  <Text name="symptoms" value="$symptoms"/>

  <Header value="AI Diagnosis"/>
  <Text name="ai_root_cause" value="$ai_root_cause"/>
  <Text name="ai_confidence" value="Confidence: $confidence"/>

  <Header value="Validation"/>
  <Choices name="validation" toName="ai_root_cause" choice="single" required="true">
    <Choice value="correct" background="green"/>
    <Choice value="partially_correct" background="yellow"/>
    <Choice value="incorrect" background="red"/>
  </Choices>

  <TextArea name="correct_root_cause" toName="ai_root_cause"
            placeholder="If incorrect or partial, provide the correct root cause"
            rows="3"
            showSubmitButton="false"/>

  <Header value="Supporting Evidence"/>
  <TextArea name="evidence" toName="ai_root_cause"
            placeholder="Provide evidence or reasoning for your validation"
            rows="4"/>

  <Rating name="diagnostic_quality" toName="ai_root_cause"
          maxRating="5"
          icon="star"
          size="medium"/>
</View>

<!-- Query Quality Assessment Template -->
<View>
  <Header value="Generated Query"/>
  <Code name="generated_query" value="$query" language="sql"/>

  <Header value="Query Context"/>
  <Text name="problem_description" value="$problem"/>
  <Text name="expected_results" value="$expected_results"/>

  <Header value="Quality Assessment"/>
  <Rating name="relevance" toName="generated_query" maxRating="5">
    <Label value="Relevance to Problem"/>
  </Rating>

  <Rating name="efficiency" toName="generated_query" maxRating="5">
    <Label value="Query Efficiency"/>
  </Rating>

  <Rating name="completeness" toName="generated_query" maxRating="5">
    <Label value="Data Completeness"/>
  </Rating>

  <TextArea name="improved_query" toName="generated_query"
            placeholder="Provide an improved query if needed"
            rows="6"/>

  <Choices name="issues" toName="generated_query" choice="multiple">
    <Choice value="missing_filters"/>
    <Choice value="inefficient_joins"/>
    <Choice value="wrong_aggregation"/>
    <Choice value="incorrect_time_range"/>
    <Choice value="missing_correlations"/>
  </Choices>
</View>
```

### Label Studio API Integration

```python
# label_studio_client.py
import requests
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import json

@dataclass
class LabelStudioConfig:
    url: str = "http://localhost:8200"
    api_key: Optional[str] = None

class LabelStudioClient:
    def __init__(self, config: LabelStudioConfig):
        self.config = config
        self.session = requests.Session()
        if config.api_key:
            self.session.headers.update({
                'Authorization': f'Token {config.api_key}'
            })

    def create_project(self, name: str, template: str) -> int:
        """Create a new annotation project"""
        response = self.session.post(
            f"{self.config.url}/api/projects",
            json={
                'title': name,
                'label_config': template,
                'enable_empty_annotation': False,
                'show_instruction': True,
                'show_skip_button': True,
                'show_annotation_history': True
            }
        )
        response.raise_for_status()
        return response.json()['id']

    def import_tasks(self, project_id: int, tasks: List[Dict[str, Any]]) -> None:
        """Import tasks for annotation"""
        response = self.session.post(
            f"{self.config.url}/api/projects/{project_id}/import",
            json=tasks,
            params={'return_task_ids': True}
        )
        response.raise_for_status()
        return response.json()

    def export_annotations(self, project_id: int, format: str = 'JSON') -> List[Dict]:
        """Export completed annotations"""
        response = self.session.get(
            f"{self.config.url}/api/projects/{project_id}/export",
            params={'exportType': format}
        )
        response.raise_for_status()
        return response.json()

    def get_project_statistics(self, project_id: int) -> Dict:
        """Get annotation progress statistics"""
        response = self.session.get(
            f"{self.config.url}/api/projects/{project_id}"
        )
        response.raise_for_status()
        data = response.json()
        return {
            'total_tasks': data.get('task_count', 0),
            'completed_tasks': data.get('finished_task_count', 0),
            'skipped_tasks': data.get('skipped_task_count', 0),
            'progress': data.get('finished_task_count', 0) / max(data.get('task_count', 1), 1)
        }
```

## LLaMA-Factory Integration

### Deployment Configuration

```yaml
# docker-compose.llama-factory.yml
version: '3.8'

services:
  llama-factory:
    image: hiyouga/llama-factory:latest
    container_name: otel-ai-llama-factory
    ports:
      - "7860:7860"  # Gradio Web UI
      - "8000:8000"  # API Server
    volumes:
      - ./data/llama-factory/models:/app/models
      - ./data/llama-factory/datasets:/app/data
      - ./data/llama-factory/checkpoints:/app/saves
      - ./configs/llama-factory:/app/configs
      - ./exports:/exports
    environment:
      - CUDA_VISIBLE_DEVICES=${CUDA_DEVICES:-0}
      - GRADIO_SERVER_NAME=0.0.0.0
      - GRADIO_SERVER_PORT=7860
      - HF_TOKEN=${HUGGINGFACE_TOKEN}
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: ${GPU_COUNT:-1}
              capabilities: [gpu]
    networks:
      - training-network

networks:
  training-network:
    driver: bridge
```

### Training Configuration

```python
# llama_factory_trainer.py
from dataclasses import dataclass, asdict
from typing import Optional, List, Literal
import json
import requests

@dataclass
class LoRAConfig:
    rank: int = 8
    alpha: int = 16
    dropout: float = 0.1
    target_modules: List[str] = None

    def __post_init__(self):
        if self.target_modules is None:
            self.target_modules = ['q_proj', 'v_proj', 'k_proj', 'o_proj']

@dataclass
class TrainingConfig:
    # Model selection
    base_model: Literal['llama3', 'llama2', 'mistral', 'qwen', 'phi'] = 'llama3'
    model_size: Literal['7b', '13b', '70b'] = '7b'

    # Training method
    training_method: Literal['lora', 'qlora', 'full', 'freeze'] = 'qlora'
    quantization_bits: Optional[int] = 4  # For QLoRA

    # LoRA configuration
    lora_config: Optional[LoRAConfig] = None

    # Training hyperparameters
    num_epochs: int = 3
    batch_size: int = 4
    gradient_accumulation_steps: int = 4
    learning_rate: float = 2e-4
    warmup_ratio: float = 0.1
    max_length: int = 2048

    # Optimizations
    use_flash_attention: bool = True
    use_unsloth: bool = False
    use_deepspeed: bool = False
    gradient_checkpointing: bool = True

    # Output
    output_dir: str = './checkpoints'
    save_steps: int = 100
    logging_steps: int = 10

    def __post_init__(self):
        if self.training_method in ['lora', 'qlora'] and self.lora_config is None:
            self.lora_config = LoRAConfig()

class LlamaFactoryTrainer:
    def __init__(self, api_url: str = "http://localhost:8000"):
        self.api_url = api_url

    def prepare_dataset(self, examples: List[TrainingExample]) -> str:
        """Convert training examples to LLaMA-Factory format"""
        dataset = []
        for example in examples:
            dataset.append({
                "instruction": self._create_instruction(example),
                "input": self._create_input(example),
                "output": self._create_output(example),
                "history": []  # Can add conversation history if needed
            })

        # Save dataset
        dataset_path = f"/app/data/otel-diagnostics-{int(time.time())}.json"
        with open(dataset_path, 'w') as f:
            json.dump(dataset, f, indent=2)

        return dataset_path

    def _create_instruction(self, example: TrainingExample) -> str:
        """Create instruction prompt from training example"""
        return f"""Analyze the following observability data and identify the root cause of the issue.

Symptoms: {', '.join(example.symptoms)}
Affected Services: {', '.join(example.affected_services)}
Time Range: {example.time_range[0]} to {example.time_range[1]}

Provide:
1. Root cause analysis
2. Diagnostic query to investigate further
3. Critical service paths affected
4. Recommended remediation steps"""

    def _create_input(self, example: TrainingExample) -> str:
        """Create input context from training example"""
        return json.dumps({
            "telemetry_summary": example.telemetry_context,
            "service_topology": example.service_topology,
            "error_signatures": example.error_signatures
        }, indent=2)

    def _create_output(self, example: TrainingExample) -> str:
        """Create expected output from training example"""
        return f"""Root Cause: {example.root_cause}

Diagnostic Query:
```sql
{example.diagnostic_query}
```

Critical Paths:
{self._format_paths(example.critical_paths)}

Remediation Steps:
{self._format_steps(example.remediation_steps)}"""

    def start_training(self, config: TrainingConfig, dataset_path: str) -> str:
        """Start fine-tuning job"""
        training_args = {
            "model_name_or_path": f"{config.base_model}-{config.model_size}",
            "dataset": dataset_path,
            "adapter_name": f"otel-diagnostics-{int(time.time())}",
            "finetuning_type": config.training_method,
            "num_train_epochs": config.num_epochs,
            "per_device_train_batch_size": config.batch_size,
            "gradient_accumulation_steps": config.gradient_accumulation_steps,
            "learning_rate": config.learning_rate,
            "warmup_ratio": config.warmup_ratio,
            "cutoff_len": config.max_length,
            "output_dir": config.output_dir,
            "save_steps": config.save_steps,
            "logging_steps": config.logging_steps,
            "flash_attn": config.use_flash_attention,
            "use_unsloth": config.use_unsloth,
            "gradient_checkpointing": config.gradient_checkpointing
        }

        if config.training_method in ['lora', 'qlora']:
            training_args.update({
                "lora_rank": config.lora_config.rank,
                "lora_alpha": config.lora_config.alpha,
                "lora_dropout": config.lora_config.dropout,
                "lora_target": ','.join(config.lora_config.target_modules)
            })

        if config.training_method == 'qlora':
            training_args["quantization_bit"] = config.quantization_bits

        response = requests.post(
            f"{self.api_url}/api/train",
            json=training_args
        )
        response.raise_for_status()
        return response.json()['job_id']

    def get_training_status(self, job_id: str) -> Dict:
        """Get training job status"""
        response = requests.get(
            f"{self.api_url}/api/train/{job_id}/status"
        )
        response.raise_for_status()
        return response.json()

    def evaluate_model(self, model_path: str, test_examples: List[TrainingExample]) -> Dict:
        """Evaluate fine-tuned model"""
        test_data = [
            {
                "input": self._create_instruction(ex) + "\n" + self._create_input(ex),
                "expected": self._create_output(ex)
            }
            for ex in test_examples
        ]

        response = requests.post(
            f"{self.api_url}/api/evaluate",
            json={
                "model_path": model_path,
                "test_data": test_data,
                "metrics": ["accuracy", "perplexity", "bleu", "rouge", "response_time"]
            }
        )
        response.raise_for_status()
        return response.json()
```

## Offline Training Pipeline

### Pipeline Architecture

```python
# training_pipeline.py
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any
import yaml
from datetime import datetime
import mlflow

class FineTuningPipeline:
    """
    End-to-end pipeline for model fine-tuning
    """

    def __init__(self, config_path: str):
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)

        self.logger = logging.getLogger(__name__)
        self.label_studio = LabelStudioClient(
            LabelStudioConfig(**self.config['label_studio'])
        )
        self.llama_factory = LlamaFactoryTrainer(
            self.config['llama_factory']['api_url']
        )

        # Initialize MLflow for experiment tracking
        mlflow.set_tracking_uri(self.config.get('mlflow_uri', 'sqlite:///mlflow.db'))
        mlflow.set_experiment(self.config.get('experiment_name', 'otel-ai-fine-tuning'))

    def run_pipeline(self,
                     data_source: str,
                     annotation_required: bool = True,
                     auto_train: bool = False) -> Dict[str, Any]:
        """
        Execute the complete fine-tuning pipeline
        """
        with mlflow.start_run() as run:
            # Step 1: Load and prepare data
            self.logger.info("Loading training data...")
            raw_data = self.load_data(data_source)
            mlflow.log_param("data_source", data_source)
            mlflow.log_metric("raw_examples", len(raw_data))

            # Step 2: Human annotation (if required)
            if annotation_required:
                self.logger.info("Creating annotation project...")
                annotated_data = self.run_annotation_workflow(raw_data)
                mlflow.log_metric("annotated_examples", len(annotated_data))
            else:
                annotated_data = raw_data

            # Step 3: Data validation and splitting
            self.logger.info("Validating and splitting data...")
            train_data, val_data, test_data = self.split_data(annotated_data)
            mlflow.log_metric("train_examples", len(train_data))
            mlflow.log_metric("val_examples", len(val_data))
            mlflow.log_metric("test_examples", len(test_data))

            # Step 4: Format conversion
            self.logger.info("Converting data formats...")
            datasets = self.prepare_datasets(train_data, val_data)

            # Step 5: Model training
            if auto_train or self.confirm_training():
                self.logger.info("Starting model training...")
                model_path = self.train_model(datasets)
                mlflow.log_artifact(model_path)

                # Step 6: Model evaluation
                self.logger.info("Evaluating model...")
                metrics = self.evaluate_model(model_path, test_data)
                for metric_name, metric_value in metrics.items():
                    mlflow.log_metric(metric_name, metric_value)

                # Step 7: Model export
                if self.should_export(metrics):
                    export_path = self.export_model(model_path)
                    mlflow.log_artifact(export_path)
                    return {
                        'status': 'success',
                        'model_path': export_path,
                        'metrics': metrics,
                        'run_id': run.info.run_id
                    }

            return {
                'status': 'completed',
                'run_id': run.info.run_id
            }

    def load_data(self, source: str) -> List[TrainingExample]:
        """Load training data from various sources"""
        if source.startswith('clickhouse://'):
            return self.load_from_clickhouse(source)
        elif source.endswith('.jsonl'):
            return self.load_from_jsonl(source)
        elif source.endswith('.csv'):
            return self.load_from_csv(source)
        else:
            raise ValueError(f"Unsupported data source: {source}")

    def run_annotation_workflow(self, data: List[TrainingExample]) -> List[TrainingExample]:
        """Run human annotation workflow using Label Studio"""
        # Create project
        project_id = self.label_studio.create_project(
            name=f"OTEL-AI Annotation {datetime.now().strftime('%Y%m%d_%H%M%S')}",
            template=self.get_annotation_template()
        )

        # Import tasks
        tasks = self.convert_to_label_studio_tasks(data)
        self.label_studio.import_tasks(project_id, tasks)

        # Wait for annotations (in production, this would be async)
        self.logger.info(f"Annotation project created: {self.config['label_studio']['url']}/projects/{project_id}")
        self.logger.info("Waiting for annotations to complete...")

        # Poll for completion or timeout
        annotations = self.wait_for_annotations(project_id)

        # Merge annotations back with data
        return self.merge_annotations(data, annotations)

    def train_model(self, datasets: Dict) -> str:
        """Train model using LLaMA-Factory"""
        config = TrainingConfig(**self.config['training'])

        # Start training
        job_id = self.llama_factory.start_training(
            config=config,
            dataset_path=datasets['train_path']
        )

        # Monitor training
        while True:
            status = self.llama_factory.get_training_status(job_id)
            self.logger.info(f"Training status: {status['status']}, Progress: {status.get('progress', 0)}%")

            if status['status'] == 'completed':
                return status['model_path']
            elif status['status'] == 'failed':
                raise Exception(f"Training failed: {status.get('error', 'Unknown error')}")

            time.sleep(30)

    def evaluate_model(self, model_path: str, test_data: List[TrainingExample]) -> Dict:
        """Evaluate the fine-tuned model"""
        return self.llama_factory.evaluate_model(model_path, test_data)

    def export_model(self, model_path: str) -> str:
        """Export model for production deployment"""
        export_dir = Path(self.config['export_dir']) / datetime.now().strftime('%Y%m%d_%H%M%S')
        export_dir.mkdir(parents=True, exist_ok=True)

        # Copy model files
        # Convert to ONNX if needed
        # Package with serving code

        return str(export_dir)
```

### Configuration File

```yaml
# config/fine_tuning_config.yaml
# Label Studio Configuration
label_studio:
  url: "http://localhost:8200"
  api_key: "${LABEL_STUDIO_API_KEY}"

# LLaMA-Factory Configuration
llama_factory:
  api_url: "http://localhost:8000"

# Training Configuration
training:
  base_model: "llama3"
  model_size: "7b"
  training_method: "qlora"
  quantization_bits: 4
  num_epochs: 3
  batch_size: 4
  gradient_accumulation_steps: 4
  learning_rate: 0.0002
  warmup_ratio: 0.1
  max_length: 2048
  use_flash_attention: true
  gradient_checkpointing: true
  output_dir: "./checkpoints"

# Data Configuration
data:
  train_split: 0.7
  val_split: 0.15
  test_split: 0.15
  min_examples: 100

# Export Configuration
export_dir: "./exports"
mlflow_uri: "http://localhost:5000"
experiment_name: "otel-ai-fine-tuning"

# Evaluation Thresholds
evaluation:
  min_accuracy: 0.75
  max_perplexity: 10.0
  min_bleu_score: 0.3
```

## Model Validation & Deployment

### A/B Testing Framework

```python
# ab_testing.py
from typing import Dict, List, Tuple
import numpy as np
from scipy import stats
from dataclasses import dataclass
import random

@dataclass
class ModelVariant:
    name: str
    model_path: str
    traffic_percentage: float

@dataclass
class ExperimentResult:
    variant: str
    request_id: str
    latency_ms: float
    accuracy: float
    human_prompts: int
    confidence_score: float
    timestamp: datetime

class ABTestingFramework:
    """
    A/B testing framework for comparing model performance
    """

    def __init__(self, control_model: str, treatment_model: str, split_ratio: float = 0.5):
        self.control = ModelVariant("control", control_model, 1 - split_ratio)
        self.treatment = ModelVariant("treatment", treatment_model, split_ratio)
        self.results: List[ExperimentResult] = []

    def route_request(self) -> ModelVariant:
        """Determine which model variant to use"""
        if random.random() < self.treatment.traffic_percentage:
            return self.treatment
        return self.control

    def record_result(self, result: ExperimentResult):
        """Record experiment result"""
        self.results.append(result)

    def analyze_results(self, min_samples: int = 100) -> Dict:
        """Analyze A/B test results with statistical significance"""
        control_results = [r for r in self.results if r.variant == "control"]
        treatment_results = [r for r in self.results if r.variant == "treatment"]

        if len(control_results) < min_samples or len(treatment_results) < min_samples:
            return {
                'status': 'insufficient_data',
                'control_samples': len(control_results),
                'treatment_samples': len(treatment_results),
                'min_samples_required': min_samples
            }

        # Calculate metrics
        metrics = {}
        for metric in ['accuracy', 'latency_ms', 'human_prompts', 'confidence_score']:
            control_values = [getattr(r, metric) for r in control_results]
            treatment_values = [getattr(r, metric) for r in treatment_results]

            # T-test for statistical significance
            t_stat, p_value = stats.ttest_ind(control_values, treatment_values)

            metrics[metric] = {
                'control_mean': np.mean(control_values),
                'control_std': np.std(control_values),
                'treatment_mean': np.mean(treatment_values),
                'treatment_std': np.std(treatment_values),
                'improvement': np.mean(treatment_values) - np.mean(control_values),
                'improvement_pct': ((np.mean(treatment_values) - np.mean(control_values)) / np.mean(control_values)) * 100,
                't_statistic': t_stat,
                'p_value': p_value,
                'significant': p_value < 0.05
            }

        # Overall recommendation
        significant_improvements = sum(
            1 for m in metrics.values()
            if m['significant'] and m['improvement_pct'] > 0
        )

        recommendation = 'deploy_treatment' if significant_improvements >= 2 else 'keep_control'

        return {
            'status': 'complete',
            'metrics': metrics,
            'recommendation': recommendation,
            'confidence': 1 - min(m['p_value'] for m in metrics.values())
        }
```

### Deployment Pipeline

```python
# deployment.py
import shutil
from pathlib import Path
import docker
import kubernetes
from typing import Optional

class ModelDeployment:
    """
    Deploy fine-tuned models to production
    """

    def __init__(self, deployment_config: Dict):
        self.config = deployment_config
        self.docker_client = docker.from_env() if deployment_config.get('use_docker') else None
        self.k8s_client = kubernetes.client.ApiClient() if deployment_config.get('use_k8s') else None

    def package_model(self, model_path: str, version: str) -> str:
        """Package model for deployment"""
        package_dir = Path(f"./packages/model-{version}")
        package_dir.mkdir(parents=True, exist_ok=True)

        # Copy model files
        shutil.copytree(model_path, package_dir / "model")

        # Create Dockerfile
        dockerfile_content = f"""
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY model /app/model
COPY serve.py /app/serve.py

EXPOSE 8080

CMD ["python", "serve.py"]
"""
        (package_dir / "Dockerfile").write_text(dockerfile_content)

        # Create serving script
        serve_script = """
import os
from fastapi import FastAPI
from transformers import AutoModelForCausalLM, AutoTokenizer
import uvicorn

app = FastAPI()

model = AutoModelForCausalLM.from_pretrained("/app/model")
tokenizer = AutoTokenizer.from_pretrained("/app/model")

@app.post("/predict")
async def predict(input_text: str):
    inputs = tokenizer(input_text, return_tensors="pt")
    outputs = model.generate(**inputs, max_length=2048)
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return {"response": response}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
"""
        (package_dir / "serve.py").write_text(serve_script)

        return str(package_dir)

    def build_docker_image(self, package_dir: str, tag: str) -> str:
        """Build Docker image for the model"""
        if not self.docker_client:
            raise ValueError("Docker client not configured")

        image, logs = self.docker_client.images.build(
            path=package_dir,
            tag=f"otel-ai-model:{tag}",
            rm=True
        )

        for log in logs:
            if 'stream' in log:
                print(log['stream'].strip())

        return image.tags[0]

    def deploy_to_kubernetes(self, image: str, namespace: str = "default") -> str:
        """Deploy model to Kubernetes"""
        if not self.k8s_client:
            raise ValueError("Kubernetes client not configured")

        deployment = {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {
                "name": "otel-ai-model",
                "namespace": namespace
            },
            "spec": {
                "replicas": 2,
                "selector": {
                    "matchLabels": {"app": "otel-ai-model"}
                },
                "template": {
                    "metadata": {
                        "labels": {"app": "otel-ai-model"}
                    },
                    "spec": {
                        "containers": [{
                            "name": "model",
                            "image": image,
                            "ports": [{"containerPort": 8080}],
                            "resources": {
                                "requests": {"memory": "4Gi", "cpu": "2"},
                                "limits": {"memory": "8Gi", "cpu": "4"}
                            }
                        }]
                    }
                }
            }
        }

        # Apply deployment
        apps_v1 = kubernetes.client.AppsV1Api()
        apps_v1.create_namespaced_deployment(namespace, deployment)

        return f"Deployment created in namespace {namespace}"

    def rollback(self, deployment_name: str, namespace: str = "default"):
        """Rollback to previous model version"""
        if self.k8s_client:
            apps_v1 = kubernetes.client.AppsV1Api()
            # Implement rollback logic
            pass
```

## Integration with Main Application

### Model Registry

```python
# model_registry.py
from typing import Dict, List, Optional
import json
from datetime import datetime
from pathlib import Path

class ModelRegistry:
    """
    Registry for managing fine-tuned models
    """

    def __init__(self, registry_path: str = "./model_registry.json"):
        self.registry_path = Path(registry_path)
        self.models = self.load_registry()

    def load_registry(self) -> Dict:
        if self.registry_path.exists():
            with open(self.registry_path, 'r') as f:
                return json.load(f)
        return {"models": []}

    def register_model(self,
                       model_id: str,
                       model_path: str,
                       metrics: Dict,
                       training_config: Dict,
                       metadata: Optional[Dict] = None) -> str:
        """Register a new fine-tuned model"""
        model_entry = {
            "id": model_id,
            "path": model_path,
            "registered_at": datetime.now().isoformat(),
            "metrics": metrics,
            "training_config": training_config,
            "metadata": metadata or {},
            "status": "registered",
            "deployed": False
        }

        self.models["models"].append(model_entry)
        self.save_registry()
        return model_id

    def get_model(self, model_id: str) -> Optional[Dict]:
        """Get model by ID"""
        for model in self.models["models"]:
            if model["id"] == model_id:
                return model
        return None

    def list_models(self, status: Optional[str] = None) -> List[Dict]:
        """List all registered models"""
        models = self.models["models"]
        if status:
            models = [m for m in models if m["status"] == status]
        return models

    def update_model_status(self, model_id: str, status: str):
        """Update model status"""
        model = self.get_model(model_id)
        if model:
            model["status"] = status
            if status == "deployed":
                model["deployed"] = True
                model["deployed_at"] = datetime.now().isoformat()
            self.save_registry()

    def save_registry(self):
        """Save registry to file"""
        with open(self.registry_path, 'w') as f:
            json.dump(self.models, f, indent=2)
```

### API Integration

```python
# api_integration.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

app = FastAPI(title="OTEL-AI Fine-Tuning API")

class TrainingRequest(BaseModel):
    data_source: str
    training_config: Optional[Dict] = None
    require_annotation: bool = True
    auto_train: bool = False

class ModelDeployRequest(BaseModel):
    model_id: str
    deployment_type: str = "kubernetes"
    namespace: str = "default"

@app.post("/api/fine-tuning/start")
async def start_fine_tuning(request: TrainingRequest):
    """Start a new fine-tuning job"""
    pipeline = FineTuningPipeline("config/fine_tuning_config.yaml")
    result = pipeline.run_pipeline(
        data_source=request.data_source,
        annotation_required=request.require_annotation,
        auto_train=request.auto_train
    )
    return result

@app.get("/api/fine-tuning/models")
async def list_models(status: Optional[str] = None):
    """List all fine-tuned models"""
    registry = ModelRegistry()
    return registry.list_models(status=status)

@app.post("/api/fine-tuning/deploy")
async def deploy_model(request: ModelDeployRequest):
    """Deploy a fine-tuned model"""
    registry = ModelRegistry()
    model = registry.get_model(request.model_id)

    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    deployment = ModelDeployment({"use_k8s": True})
    package_dir = deployment.package_model(model["path"], request.model_id)
    image = deployment.build_docker_image(package_dir, request.model_id)
    result = deployment.deploy_to_kubernetes(image, request.namespace)

    registry.update_model_status(request.model_id, "deployed")
    return {"status": "success", "details": result}

@app.post("/api/fine-tuning/ab-test")
async def start_ab_test(control_model: str, treatment_model: str, split_ratio: float = 0.5):
    """Start A/B testing between two models"""
    ab_test = ABTestingFramework(control_model, treatment_model, split_ratio)
    # Store in global registry for request routing
    return {"test_id": "generated_test_id", "status": "active"}
```

## Success Metrics

### Training Metrics
- **Data Quality**: >90% annotation agreement score
- **Training Efficiency**: <4 hours for 7B parameter model with QLoRA
- **Model Size Reduction**: >75% reduction with quantization
- **GPU Memory Usage**: <24GB for fine-tuning

### Performance Metrics
- **Accuracy Improvement**: >15% over base model
- **Latency**: <200ms inference time for diagnostic queries
- **Human Intervention Reduction**: >50% fewer prompts required
- **Root Cause Accuracy**: >80% correct identification

### Deployment Metrics
- **Model Registry Size**: <10GB per model version
- **Deployment Time**: <5 minutes from registry to production
- **Rollback Time**: <30 seconds for model rollback
- **A/B Test Duration**: 24-48 hours for statistical significance

## Implementation Timeline

### Phase 1: Infrastructure Setup (Week 1)
- Deploy Label Studio and PostgreSQL
- Deploy LLaMA-Factory with GPU support
- Set up MLflow for experiment tracking
- Create data export pipeline from Feature 005

### Phase 2: Annotation Workflow (Week 2)
- Create Label Studio templates
- Implement data import/export scripts
- Build annotation management API
- Test with sample diagnostic data

### Phase 3: Training Pipeline (Week 3)
- Implement LLaMA-Factory integration
- Build training configuration management
- Create model evaluation framework
- Test with multiple base models

### Phase 4: Deployment & Integration (Week 4)
- Build model registry system
- Implement A/B testing framework
- Create deployment automation
- Integrate with main application API

## Future Enhancements

### Advanced Training Techniques
- **RLHF (Reinforcement Learning from Human Feedback)**: Incorporate preference learning
- **Multi-Task Learning**: Train on multiple diagnostic scenarios simultaneously
- **Continuous Learning**: Automatic retraining with new data
- **Federated Learning**: Train across multiple deployments without data sharing

### Model Optimization
- **Knowledge Distillation**: Create smaller student models
- **Pruning & Quantization**: Further reduce model size
- **ONNX Export**: Cross-platform deployment
- **Edge Deployment**: Run models on edge devices

### Integration Enhancements
- **Model Versioning**: Git-like version control for models
- **Automated Testing**: Regression tests for each model version
- **Model Monitoring**: Production performance tracking
- **Drift Detection**: Identify when retraining is needed

This feature provides a complete offline pipeline for fine-tuning observability-specific models, operating independently from the main application while enabling seamless integration of improved models back into production.