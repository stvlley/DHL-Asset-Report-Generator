"""
Site model for distribution center information.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class Site(Base):
    __tablename__ = "sites"

    site_code = Column(String(20), primary_key=True)
    site_name = Column(String(100), nullable=False)
    account_name = Column(String(100), nullable=False, index=True)
    region = Column(String(50), index=True)
    address = Column(Text)
    city = Column(String(100))
    state = Column(String(50))
    country = Column(String(10), default="US")
    primary_contact = Column(String(100))
    contact_email = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    gl_mappings = relationship("SiteGLMapping", backref="site", cascade="all, delete-orphan")
