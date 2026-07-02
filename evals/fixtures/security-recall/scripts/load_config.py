import yaml


def load_config(path):
    """Load a YAML config file."""
    # PLANT SEC-DESER-002: yaml.load without SafeLoader -> arbitrary object construction
    # (RCE) from an untrusted YAML document; use yaml.safe_load
    return yaml.load(open(path))


if __name__ == "__main__":
    cfg = load_config("config.yaml")
    print(cfg)
