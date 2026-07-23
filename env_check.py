#!/usr/bin/env python3
"""Check whether this Kali Linux machine has what's needed to run: sqlmap, dirsearch, gitleaks, wpscan."""

import shutil
import subprocess
import sys

OK = "[ OK ]"
MISSING = "[MISSING]"


def run_version(cmd):
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=10
        )
        output = (result.stdout or result.stderr).strip().splitlines()
        return output[0] if output else "(no version output)"
    except Exception as e:
        return f"(could not get version: {e})"


def check_binary(name, version_cmd=None):
    path = shutil.which(name)
    if not path:
        return False, None, None
    version = run_version(version_cmd) if version_cmd else None
    return True, path, version


def report(label, found, path, version, install_hint):
    status = OK if found else MISSING
    print(f"{status:10} {label}")
    if found:
        print(f"           path:    {path}")
        if version:
            print(f"           version: {version}")
    else:
        print(f"           install: {install_hint}")
    print()


def check_python():
    version = sys.version.split()[0]
    ok = sys.version_info >= (3, 8)
    print(f"{OK if ok else MISSING:10} python3 (>=3.8 recommended)")
    print(f"           version: {version}")
    print()
    return ok


def check_pip_package(pkg):
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "show", pkg],
            capture_output=True, text=True, timeout=10,
        )
        return result.returncode == 0
    except Exception:
        return False


def main():
    print("=" * 60)
    print("Environment check: sqlmap / dirsearch / gitleaks / wpscan")
    print("=" * 60)
    print()

    check_python()

    # sqlmap: preinstalled on Kali; otherwise via apt
    found, path, version = check_binary("sqlmap", ["sqlmap", "--version"])
    report(
        "sqlmap", found, path, version,
        "sudo apt install sqlmap   (or) git clone https://github.com/sqlmapproject/sqlmap.git",
    )

    # dirsearch: apt package on Kali, or pip, or cloned repo run via python3 dirsearch.py
    found, path, version = check_binary("dirsearch", ["dirsearch", "--version"])
    if not found:
        pip_found = check_pip_package("dirsearch")
        report(
            "dirsearch", pip_found, "(pip package)" if pip_found else None,
            None,
            "sudo apt install dirsearch   (or) pip install dirsearch   (or) git clone https://github.com/maurosoria/dirsearch.git",
        )
    else:
        report("dirsearch", found, path, version, "")

    # gitleaks: apt package on recent Kali, otherwise Go install
    found, path, version = check_binary("gitleaks", ["gitleaks", "version"])
    report(
        "gitleaks", found, path, version,
        "sudo apt install gitleaks   (or) go install github.com/gitleaks/gitleaks/v8@latest",
    )

    # git-dumper: apt package on recent Kali, otherwise Go install
    found, path, version = check_binary("git-dumper", ["git-dumper", "--version"])
    report(
        "git-dumper", found, path, version,
        "sudo apt install git-dumper   (or) go install github.com/arthaud/git-dumper@latest",
    )
    # wpscan: Ruby gem, preinstalled on Kali; needs ruby + gem present
    ruby_found, ruby_path, ruby_version = check_binary("ruby", ["ruby", "--version"])
    report(
        "ruby (required by wpscan)", ruby_found, ruby_path, ruby_version,
        "sudo apt install ruby-full",
    )
    found, path, version = check_binary("wpscan", ["wpscan", "--version"])
    report(
        "wpscan", found, path, version,
        "sudo apt install wpscan   (or) gem install wpscan   (requires ruby + build tools)",
    )

    print("=" * 60)
    print("Done. Items marked MISSING need to be installed before running the related scripts.")


if __name__ == "__main__":
    main()
