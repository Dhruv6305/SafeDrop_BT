"""SafeDrop Flask Application Factory."""
import os
from flask import Flask
from flask_cors import CORS

from .db import init_db
from .seed import seed_if_empty


def create_app():
    app = Flask(
        __name__,
        template_folder=os.path.join(os.path.dirname(__file__), '..', 'templates'),
        static_folder=os.path.join(os.path.dirname(__file__), '..', 'static'),
    )
    app.config['DATABASE'] = os.path.join(
        os.path.dirname(__file__), '..', 'instance', 'safedrop.db'
    )
    CORS(app)

    # Ensure instance dir exists
    os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'instance'), exist_ok=True)

    with app.app_context():
        init_db(app)
        seed_if_empty(app)

    # Register blueprints
    from .routes.admin import admin_bp
    from .routes.claimant import claimant_bp
    from .routes.attack import attack_bp
    from .routes.blockchain import blockchain_bp
    from .routes.pages import pages_bp

    app.register_blueprint(pages_bp)
    app.register_blueprint(admin_bp, url_prefix='/api')
    app.register_blueprint(claimant_bp, url_prefix='/api')
    app.register_blueprint(attack_bp, url_prefix='/api')
    app.register_blueprint(blockchain_bp, url_prefix='/api')

    return app
