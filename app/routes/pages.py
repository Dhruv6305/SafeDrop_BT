"""Pages blueprint — serves the SPA shell."""
from flask import Blueprint, render_template, current_app

pages_bp = Blueprint('pages', __name__)


@pages_bp.route('/')
def index():
    return render_template('index.html')
