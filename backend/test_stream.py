import asyncio
import sys
from app.services.ai_providers import get_provider_router, close_nvidia_client

async def main():
    router = get_provider_router()
    system = "You are a helpful assistant."
    messages = [{"role": "user", "content": "Explain step by step why the sky is blue using a very short thought process."}]
    
    models_to_test = [
        "qwen/qwq-32b",
        "deepseek-ai/deepseek-v3.2",
        "qwen/qwen3-coder-480b-a35b-instruct"
    ]
    
    for model in models_to_test:
        print(f"\n{'='*50}\nTesting model: {model}\n{'='*50}")
        try:
            async for chunk in router.stream(system, messages, model_override=model, max_tokens=100):
                print(chunk, end="", flush=True)
        except Exception as e:
            print(f"\nError encountered: {e}")
            
    print("\n\nClosing client...")
    await close_nvidia_client()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
