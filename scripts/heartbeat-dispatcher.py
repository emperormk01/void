
import time
import subprocess
import os

# Configuration
REPO = "larsontrey720/void"
SKILL = "heartbeat"
INTERVAL = 1800  # 30 minutes in seconds

def trigger_workflow():
    print(f"[{time.ctime()}] Triggering {SKILL} for {REPO}...")
    try:
        # Using 'gh' CLI which is already available in the environment
        result = subprocess.run(
            ["gh", "workflow", "run", "void.yml", "-f", f"skill={SKILL}", "--repo", REPO],
            capture_output=True,
            text=True,
            check=True
        )
        print(f"[{time.ctime()}] Success: {result.stdout.strip()}")
    except subprocess.CalledProcessError as e:
        print(f"[{time.ctime()}] ERROR: Failed to trigger workflow.")
        print(f"Error output: {e.stderr}")

if __name__ == "__main__":
    print(f"🚀 Void Heartbeat Dispatcher started.")
    print(f"Target: {REPO} | Skill: {SKILL} | Interval: {INTERVAL}s")
    
    while True:
        trigger_workflow()
        print(f"[{time.ctime()}] Sleeping for {INTERVAL}s...")
        time.sleep(INTERVAL)
