import time
from langchain_core.runnables import Runnable
from langchain_core.messages import AIMessage
from app.utils.observability import get_observability_client, OBSERVABILITY_ENABLED, generate_trace_id

class MistralLLM(Runnable):
    """OpenAI-compatible chat wrapper with same- and cross-provider fallback support."""
    def __init__(
        self,
        client,
        model,
        temperature=0.6,
        fallback_models=None,
        provider_name="mistral",
        fallback_providers=None,
    ):
        super().__init__()
        self.client = client
        self.model = model
        self.temperature = temperature
        self.providers = [{
            "name": provider_name,
            "client": client,
            "model": model,
        }]

        for fallback_model in fallback_models or []:
            if fallback_model and fallback_model != model:
                self.providers.append({
                    "name": provider_name,
                    "client": client,
                    "model": fallback_model,
                })

        self.providers.extend(fallback_providers or [])
    
    def _format_messages(self, prompt):
        """Format prompt into messages format."""
        if hasattr(prompt, 'to_messages'):
            # It's a ChatPromptValue, convert to messages
            messages = prompt.to_messages()
            formatted_messages = []
            for msg in messages:
                if hasattr(msg, 'content'):
                    role = msg.__class__.__name__.replace('Message', '').lower()
                    if role == 'human':
                        role = 'user'
                    elif role == 'ai':
                        role = 'assistant'
                    formatted_messages.append({"role": role, "content": msg.content})
            return formatted_messages
        elif isinstance(prompt, str):
            # Simple string prompt
            return [{"role": "user", "content": prompt}]
        else:
            # Fallback
            return [{"role": "user", "content": str(prompt)}]
    
    def _try_provider(self, provider, formatted_messages):
        """Try to invoke one OpenAI-compatible provider."""
        return provider["client"].chat.completions.create(
            model=provider["model"],
            messages=formatted_messages,
            temperature=self.temperature,
            extra_body={}
        )
    
    def invoke(self, prompt, config=None):
        """Invoke method to work with LangChain chains with automatic fallback"""
        start_time = time.time()
        formatted_messages = self._format_messages(prompt)
        
        trace_id = generate_trace_id()
        request_id = ""
        user_id = 0
        
        # Try to extract context from config if available
        if config and isinstance(config, dict):
            request_id = config.get("request_id", "")
            user_id = config.get("user_id", 0)
        
        last_error = None
        fallback_used = False
        for provider_index, provider in enumerate(self.providers):
            provider_name = provider["name"]
            model = provider["model"]
            try:
                completion = self._try_provider(provider, formatted_messages)
                
                # Calculate latency
                latency_ms = (time.time() - start_time) * 1000
                
                # Extract token usage and cost
                input_tokens = 0
                output_tokens = 0
                total_tokens = 0
                cost_usd = 0.0
                
                if hasattr(completion, 'usage'):
                    input_tokens = completion.usage.prompt_tokens if hasattr(completion.usage, 'prompt_tokens') else 0
                    output_tokens = completion.usage.completion_tokens if hasattr(completion.usage, 'completion_tokens') else 0
                    total_tokens = completion.usage.total_tokens if hasattr(completion.usage, 'total_tokens') else (input_tokens + output_tokens)
                
                # Push LLM usage event (non-blocking)
                if OBSERVABILITY_ENABLED:
                    try:
                        obs_client = get_observability_client()
                        obs_client.push_llm_usage(
                            user_id=user_id,
                            request_id=request_id,
                            provider=provider_name,
                            model=model,
                            operation="chat_completion",
                            latency_ms=latency_ms,
                            success=True,
                            error_code=None,
                            error_message=None,
                            input_tokens=input_tokens,
                            output_tokens=output_tokens,
                            total_tokens=total_tokens,
                            cost_usd=cost_usd,
                            fallback_used=fallback_used,
                            fallback_model=None,
                            trace_id=trace_id
                        )
                    except Exception:
                        pass  # Never block on observability
                
                # Return an AIMessage object for compatibility
                return AIMessage(content=completion.choices[0].message.content)
            except Exception as e:
                error_str = str(e)
                error_dict = {}
                error_code = None
                
                # Try to extract provider error details when they are available.
                if hasattr(e, 'response') and hasattr(e.response, 'json'):
                    try:
                        error_dict = e.response.json()
                    except:
                        pass
                
                # Check if it's a rate limit error (429)
                is_rate_limit = (
                    '429' in error_str or 
                    'Rate limit' in error_str or 
                    'rate limit' in error_str.lower() or
                    (hasattr(e, 'status_code') and e.status_code == 429) or
                    (isinstance(error_dict, dict) and error_dict.get('error', {}).get('code') == 429)
                )
                
                if is_rate_limit:
                    error_code = "429"
                
                last_error = e
                
                if provider_index < len(self.providers) - 1:
                    next_provider = self.providers[provider_index + 1]
                    fallback_used = True
                    print(
                        f"⚠ {provider_name}/{model} failed; switching to "
                        f"{next_provider['name']}/{next_provider['model']}"
                    )
                    continue
                else:
                    # Push error event
                    latency_ms = (time.time() - start_time) * 1000
                    if OBSERVABILITY_ENABLED:
                        try:
                            obs_client = get_observability_client()
                            obs_client.push_llm_usage(
                                user_id=user_id,
                                request_id=request_id,
                                provider=provider_name,
                                model=model,
                                operation="chat_completion",
                                latency_ms=latency_ms,
                                success=False,
                                error_code=error_code or "UNKNOWN",
                                error_message=str(e),
                                input_tokens=0,
                                output_tokens=0,
                                total_tokens=0,
                                cost_usd=0.0,
                                fallback_used=fallback_used,
                                fallback_model=(
                                    f"{self.providers[provider_index + 1]['name']}/"
                                    f"{self.providers[provider_index + 1]['model']}"
                                    if fallback_used and provider_index < len(self.providers) - 1
                                    else None
                                ),
                                trace_id=trace_id
                            )
                        except Exception:
                            pass
                    
                    print(f"Error in {provider_name} LLM invoke with {model}: {e}")
                    raise
        
        # All models failed
        latency_ms = (time.time() - start_time) * 1000
        if OBSERVABILITY_ENABLED:
            try:
                obs_client = get_observability_client()
                obs_client.push_llm_usage(
                    user_id=user_id,
                    request_id=request_id,
                    provider=self.providers[0]["name"],
                    model=self.model,
                    operation="chat_completion",
                    latency_ms=latency_ms,
                    success=False,
                    error_code="ALL_MODELS_FAILED",
                    error_message=str(last_error) if last_error else "Unknown error",
                    input_tokens=0,
                    output_tokens=0,
                    total_tokens=0,
                    cost_usd=0.0,
                    fallback_used=fallback_used,
                    fallback_model=None,
                    trace_id=trace_id
                )
            except Exception:
                pass
        
        print(f"Error in Mistral LLM invoke: All models failed. Last error: {last_error}")
        raise last_error
